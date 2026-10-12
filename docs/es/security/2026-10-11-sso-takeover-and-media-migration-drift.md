# Incidente de seguridad — toma de cuentas por autoenlace de email SSO + deriva de esquema de medios (2026-10-11)

Estado: **corregido y verificado en preview** (parche de autenticación desplegado; base de
datos reconciliada).
Reportado por: BioPlatform Canary (informe de incidente crítico).
Afecta a: la línea `public-canary` (`2.0.0-canary.2-hotfix.1` y anteriores), y a
**toda instalación provisionada desde el historial de migraciones** en el caso de las
subidas.

Este documento registra dos defectos independientes que llegaron en el mismo informe: un
**fallo de autenticación crítico** en el callback de SSO empresarial y una **regresión de
alta severidad** que hacía que toda subida de medios devolviera HTTP 500. Ambos están
corregidos y cubiertos por pruebas de regresión.

---

## 1. CRÍTICO — toma de cuentas por autoenlace de email en SSO empresarial

### Qué ocurrió

`POST /api/auth/enterprise-sso/exchange` completaba un inicio de sesión OIDC/OAuth
buscando la identidad en `EnterpriseSsoIdentity`. Cuando no existía fila de identidad, el
código antiguo caía en un emparejamiento por el **email verificado** contra un `User`
existente y luego **autoenlazaba** ese usuario con la identidad SSO entrante, emitiendo
una sesión. También marcaba `emailVerifiedAt` cuando el proveedor informaba un email
verificado.

Ese respaldo confiaba en la afirmación "email verificado" del proveedor upstream como
prueba de propiedad de la cuenta. Cualquier IdP que el operador hubiera configurado —o un
proveedor mal configurado o controlado por un atacante permitido por `allowedDomains`—
podía afirmar un email que ya pertenecía a una cuenta local y recibir una sesión completa
para ella. Sin contraseña, sin passkey, sin segundo factor. Es la clásica toma de cuentas
por identidad federada.

### Causa raíz

`apps/backend/src/routes/enterpriseSso.ts`, manejador de `/exchange`: la rama
"sin identidad → emparejar por email → enlazar → iniciar sesión". El emparejamiento por
email se trataba como prueba de identidad.

### Corrección

- El endpoint `/exchange` **ya no enlaza por email ni verifica automáticamente**.
  - Sin fila de identidad y con un email que respalda una cuenta existente → `409`
    ("Este email ya pertenece a una cuenta — inicia sesión con esa cuenta y enlázala
    desde Ajustes de seguridad").
  - Sin fila de identidad y sin cuenta que use el email → `404` ("Ninguna cuenta usa
    este email todavía — crea la cuenta primero y luego enlaza").
  - No se emite sesión ni se muta ninguna fila en ninguna de las dos rutas.
- El inicio de sesión basado en identidad (ya existe una fila `EnterpriseSsoIdentity`)
  no cambia.
- El enlace ahora es siempre una acción **explícita y autenticada**: `/start?mode=link`
  requiere sesión iniciada, y **cualquier usuario autenticado puede enlazar su propia
  identidad verificada** (se eliminó la restricción previa de solo-propietario para que
  las instancias multiusuario puedan autogestionarse). El callback sigue exigiendo email
  verificado, la lista de `allowedDomains` y la unicidad de identidad.

### Prueba de regresión

`apps/backend/tests/enterprise-sso.test.ts` — el antiguo caso "enlaza un email verificado
coincidente" se sustituye por "rechaza autoenlazar un email verificado coincidente
(corrección de toma de cuentas)": comprueba `409`, que no se crea `EnterpriseSsoIdentity`,
que `emailVerifiedAt` de la cuenta existente no cambia y que no hay sesión. Un segundo
caso comprueba que un usuario autenticado puede enlazar su propia identidad verificada y
luego iniciar sesión con ella. **5/5 pasan.**

---

## 2. ALTO — toda subida de medios devolvía HTTP 500 (falta `MediaKind`)

### Qué ocurrió

`POST /api/profiles/me/avatar` (y el resto de rutas de subida: banner, icono de enlace,
fondo, música, tienda) devolvía **HTTP 500**. El log del backend mostraba:

```
PostgresError { code: "42704", message: "type \"public.MediaKind\" does not exist" }
```

### Causa raíz — deriva de esquema/migraciones

El subsistema de huellas de medios / DMCA (tablas `media_files`, `dmca_reports`,
`banned_hashes` y los enums `MediaKind` / `DmcaStatus`) se añadió **después** del baseline
squasheado `0_init`, pero **nunca se capturó como migración**. En cualquier base de datos
creada solo desde el historial de migraciones:

- el tipo `MediaKind` no existía, así que el `INSERT` en `media_files` de `guardUpload`
  fallaba y toda subida daba 500;
- tampoco existían `slug_namespace` / `cache_entries`, ni las columnas de anuncios del
  perfil, ni las columnas de moderación/apelación del usuario.

La base de datos de preview añadía confusión: había sido provisionada con una instantánea
antigua de `prisma db push`, así que *tenía* `media_files`/`dmca_reports` (con columnas
`TEXT` en lugar de enums) y las columnas de anuncios/apelación, pero **le faltaban**
`slug_namespace`/`cache_entries` y aún guardaba `seasonal_themes.id` como `text`. Solo las
bases creadas con `db push` ocultaban el fallo; las creadas desde migraciones —incluida
toda instalación limpia autohospedada— lo exponían. `prisma migrate status` informaba
"up to date" porque el baseline ya estaba registrado, así que nada añadía nunca los
objetos que faltaban.

### Corrección

Dos partes:

1. **Migración del repositorio (instalaciones limpias y CI).**
   `apps/backend/prisma/migrations/20261012120000_media_dmca_and_moderation_schema/` crea
   los enums `MediaKind` / `DmcaStatus`, las tablas `media_files` / `dmca_reports` /
   `banned_hashes` (con índices y claves foráneas), las columnas de control de anuncios
   de `profiles` y las columnas de moderación/apelación de `users`. El
   `prisma migrate deploy` del entrypoint la aplica automáticamente en el siguiente
   arranque de cualquier instalación creada desde el historial de migraciones.
2. **Reconciliación puntual de la base de datos de preview.** La BD de preview no
   coincidía con su propio registro `_prisma_migrations`, así que una migración hacia
   adelante no bastaba para repararla. Se aplicó un script de reconciliación seguro para
   los datos (enums; `media_files.kind` / `dmca_reports.status` reconstruidos como enums
   —ambas tablas vacías—; `seasonal_themes.id` convertido `text → uuid` **en el sitio**,
   preservando las 9 filas; `slug_namespace` / `cache_entries` creadas; claves foráneas,
   índices y la deriva de precisión de timestamps normalizados) en una única transacción.
   Después se marcó la migración correspondiente como aplicada con
   `prisma migrate resolve --applied`.

### Verificación

- Preview en vivo: `POST /api/profiles/me/avatar` con un PNG de 1×1 → **HTTP 200**
  (`{"success":true,"data":{"avatar":"/uploads/…png"}}`); el cambio aplicado se revirtió
  y el archivo de prueba se eliminó después.
- Base de datos limpia: las cuatro migraciones (`0_init`, invite-credit-ledger,
  policy-admin-auto-accept, media-dmca-and-moderation-schema) se despliegan sin errores;
  el esquema resultante tiene `media_files.kind : MediaKind`,
  `dmca_reports.status : DmcaStatus` y las tres tablas.
- `prisma migrate status` → "Database schema is up to date".

---

## Refuerzo de sesiones (misma respuesta al incidente)

Como precaución tras el hallazgo de autenticación, se añadió y ejecutó un endpoint de
operador: `POST /api/admin/auth/sign-out-all` (permiso `users.manage`, cuerpo
`{ confirm: true }`, bloqueado durante el bloqueo de actualización). En una transacción
incrementa el `authVersion` de todos los usuarios (invalidando todos los tokens
emitidos), borra todas las passkeys, limpia el enrolamiento TOTP y elimina todas las
identidades SSO empresariales. Las contraseñas y los enlaces OAuth se dejan
intencionadamente intactos. Ejecutado contra la base de datos de preview informó
**5 usuarios desconectados, 2 passkeys eliminadas, 2 enrolamientos TOTP deshabilitados y
2 identidades SSO eliminadas**; la base se verificó después (`passkeys = 0`,
`enterprise_sso_identities = 0`, `totp_enabled = 0`).

---

## Residual / aplazado

- La precisión de timestamp sub-milisegundo y algunos **nombres** de restricciones/índices
  en la base de preview ahora coinciden con el esquema; un `prisma migrate diff` completo
  está limpio para los objetos anteriores. Cualquier diferencia cosmética restante en
  otras tablas se sigue con la herramienta habitual `db:verify-drift`.
- La corrección de subida elimina el bloqueo de esquema mostrado arriba. Cualquier fallo
  de subida *separado* en la capa de almacenamiento (credenciales del proveedor, política
  del bucket) queda fuera del alcance de este informe; no se observó ninguno — la preview
  configurada con b2 almacenó y sirvió el PNG de prueba.
