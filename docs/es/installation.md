# Instalación

El instalador de un solo comando (`install.sh`), el desinstalador
(`uninstall.sh`) y el actualizador (`update.sh`) son los tres scripts de
operación incluidos en la raíz del repositorio. Comparten la misma biblioteca
de helpers, el mismo esquema de `.env` y el mismo estilo de TUI (menús
numerados, `--yes`, `--dry-run`, `--help`, `--version`), de modo que lo que
funciona para uno funciona para los tres — ver
[TASKS.md](../TASKS.md) "Medium Priority".

## install.sh — de servidor vacío a stack en marcha

```bash
curl -fsSL https://raw.githubusercontent.com/00kino547/BioPlatform/2.0.0-canary.2/install.sh | bash
# o, desde un checkout del repositorio:
sh install.sh
```

El script recorre, en orden:

1. **Auto-verificación** — al ser piped, se re-descarga a sí mismo y lo
   comprueba contra el `install.sh.sha256` publicado; un fallo de coincidencia
   aborta antes de escribir nada. Un checkout verifica contra
   `BIOPLATFORM_SHA256` / `--checksum`.
2. **Preflight** — Docker + Compose v2 presentes, el usuario actual puede
   escribir en el directorio de despliegue, al menos 2 GiB libres.
3. **Tipo de instalación** — el primer menú:
   - `[1] docker — published images pulled from a registry (recommended)`: el
     compose `docker-compose.prebuilt.yml`, la config de nginx y el
     `.env.example` se descargan/copian al directorio de despliegue.
   - `[2] standalone — build the images from source`: el directorio de
     despliegue *es* el código fuente (un checkout, o el tarball de la release
     extraído en su lugar) y el stack se construye con `docker compose build`.
4. **Guardia anti-clobber** — un `.env` existente siempre se niega a ser
   sobrescrito; un compose existente se niega salvo con `--force` (el
   standalone-en-checkout está exento: el compose *es* el despliegue).
5. **Generación del `.env`** — se copia `.env.example` (modo `600`) y luego los
   valores preguntados lo sobrescriben: `APP_URL` (URL completa) y todo lo
   derivado de su host, `NODE_ENV`, `BILLING_CURRENCY`, `INVITE_PRICE_PACKS`, la
   cuenta admin (contraseña introducida dos veces, validada contra la lista de
   contraseñas débiles del backend, nunca mostrada), SMTP opcional, storage
   (`local` / `s3` / `b2`), captcha (`none` / `turnstile`) y TLS.
   `POSTGRES_PASSWORD` y `JWT_SECRET` se generan y nunca se imprimen.
6. **Plan + confirmación** — se muestra el plan completo y luego `1/5 migrate`
   (base de datos nueva), `2/5 pull/build`, `3/5 up --profile nginx`, `4/5
   health` (`/api/health`, y luego la ruta pública `/api/version`), `5/5`
   resumen con la URL del admin. Cualquier fallo revierte lo iniciado e imprime
   los comandos de recuperación; los volúmenes y el `.env` nunca se eliminan.

### Opciones

```
  -d, --deployment-dir DIR   (por defecto: /srv/bioplatform, o el checkout para standalone)
  -t, --type MODE            docker | standalone (omite el menú)
      --image-tag TAG        tag de imagen para el modo docker (por defecto: latest)
      --seed                 SEED_ON_START=true en el primer arranque (admin + invite codes)
      --checksum SHA256      SHA-256 esperado de este script
  -s, --set KEY=VALUE        sobrescribe cualquier valor del .env (repetible, gana)
      --defaults             no interactivo: todo prompt usa su valor por defecto
  -f, --force                permite un compose existente (nunca sobrescribe .env)
  -n, --dry-run              imprime el plan, no cambia nada
      --health-timeout SECS  por defecto 180
  -y, --yes                  no pedir confirmación
```

## update.sh — backup, migrate, rollback

Ver [Deployment](./deployment.md#updates) y la cabecera del script. La única
regla no negociable: un `pg_dump` **verificado** ocurre antes de cualquier
migración. `--dry-run` imprime el plan sin tocar nada; `--yes` omite la
confirmación. El modo piped descarga exactamente dos helpers
(`bioplatform-common.sh`, `bioplatform-backup.sh`), fijados al tag de versión
del propio script.

## uninstall.sh — desmontaje reversible, dry-run por defecto

```bash
sh uninstall.sh            # dry run: imprime el inventario, no cambia nada
sh uninstall.sh --yes      # detiene el stack (volúmenes, .env y archivos se conservan)
sh uninstall.sh --purge --yes   # además elimina volúmenes, imágenes y .env
```

- **Dry-run es el comportamiento por defecto.** Se imprime el inventario
  (contenedores, volúmenes, redes, imágenes, dumps existentes, certs) y no se
  toca nada.
- **Un backup verificado siempre va primero** (el mismo pipeline de `pg_dump`
  que update.sh), de modo que los datos sobreviven a cualquier error.
  `--skip-backup` se rechaza combinado con `--purge`.
- **Soporte a medio parar** — si el stack ya está caído, solo se arranca
  `postgres` el tiempo suficiente para el dump y luego se detiene de nuevo.
- **Los volúmenes de datos nunca se eliminan por `--yes`.** Que `--purge`
  elimine `postgres_data` / `uploads_data` exige escribir el directorio de
  despliegue exactamente (sin TTY no hay purge).
- `docker compose down` nunca usa `-v`; sin `--purge` la instalación es
  totalmente repetible.

## Contrato de seguridad

Estas reglas las comparten los tres scripts:

- Un único esquema de `.env` (`.env.example`); una variable añadida allí es
  entendida por todos los scripts (`BIOPLATFORM_COMPOSE_FILE` es lo que une un
  despliegue).
- Nunca se ejecuta nada que el script no haya descargado (el modo piped baja
  sus helpers desde el mismo tag de versión del que fue descargado).
- Los secretos se escriben con permisos root-only y nunca se muestran.
- La documentación se mantiene espejada en `docs/en/installation.md`.