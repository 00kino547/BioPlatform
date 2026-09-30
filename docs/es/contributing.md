# Contribuir

Gracias por considerar contribuir a BioPlatform. Esta guía define los estándares que toda contribución debe cumplir. Léela completa antes de enviar trabajo y síguela en cada cambio, sin excepciones.

## Política de Idioma

**El inglés es el idioma obligatorio en este proyecto.** Usa inglés en todo lo siguiente, sin excepción:

- Código fuente: identificadores, cadenas visibles en la interfaz, comentarios (consulta la [regla de comentarios](#estándares-de-código))
- Mensajes de commit, títulos de pull requests y descripciones de pull requests
- Issues y discusiones de GitHub
- Todos los archivos de documentación en `docs/en/`

La documentación en español vive en `docs/es/` y es una traducción de la versión en inglés, nunca al revés. `docs/es/` debe mantener el mismo conjunto de archivos y la misma estructura que `docs/en/`.

## Primeros Pasos

Requisitos: Node.js 20+, `corepack enable` para pnpm y una instancia de PostgreSQL (local o mediante Docker Compose).

1. Haz fork del repositorio en GitHub.
2. Clona tu fork y añade el remoto upstream.
3. Crea una rama de características desde `main` con un nombre corto y descriptivo (p. ej. `feat/theming`, `fix/terminal-ls`).

```bash
git clone https://github.com/TU_USUARIO/BioPlatform.git
cd BioPlatform
git remote add upstream https://github.com/BioPlatform/BioPlatform.git
git checkout -b feat/tu-cambio
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm --filter @bioplatform/backend db:seed
pnpm dev
```

`pnpm dev` ejecuta ambos workspaces: el backend sirve la API y el frontend sirve la SPA de React.

## Estructura del Proyecto

```
apps/frontend/    # SPA de React (Vite + TailwindCSS 4)
apps/backend/     # API Express (Prisma + PostgreSQL)
packages/shared/  # Tipos e interfaces de almacenamiento compartidos
docs/en/          # Documentación en inglés
docs/es/          # Documentación en español (espejo de docs/en/)
```

## Estándares de Código

- TypeScript en modo estricto, en todos los workspaces.
- No añadas comentarios salvo que se solicite explícitamente. El código debe explicarse por sí mismo.
- Composición sobre archivos grandes. Divide componentes, rutas y utilidades en módulos pequeños y enfocados.
- Cada módulo debe ser independiente y no importar código de funcionalidades hermanas.
- El alias `@/` mapea a `src/`.
- Reutiliza componentes y patrones existentes. No dupliques lógica ya presente en el repositorio.
- Lee `AGENTS.md`, `PROJECT_MAP.md` y `DECISIONS.md` antes de cambiar código.

### Reglas de Seguridad y Datos

- Sanea toda entrada de usuario antes de almacenarla (elimina `<`, `>`, `{`, `}`).
- Valida las URLs contra una lista blanca de protocolos (`http`, `https`, `mailto`) — nunca permitas `javascript:` ni similares.
- Los nombres de plataforma deben pertenecer a una lista blanca fija; nunca aceptes cadenas arbitrarias.
- Usa bcrypt (12 rondas) para toda operación con contraseñas.
- Nunca hagas commit de secretos, tokens o credenciales. Las claves deben venir de variables de entorno validadas con Zod.
- Cuando una solicitud sea ambigua, pregunta a los mantenedores en lugar de suponer.

## Pruebas y Controles de Calidad

Todo cambio debe superar lo siguiente antes de considerarse completo:

1. `pnpm typecheck` — sin errores de TypeScript en ningún workspace.
2. `pnpm --filter @bioplatform/backend test` — la suite de pruebas del backend debe pasar. Ejecuta las pruebas relevantes al cambio; cuando añadas comportamiento, añade pruebas para él.
3. Lint — el script de lint del workspace no debe reportar errores.
4. Paridad de documentación — si cambias o añades una página en `docs/en/`, actualiza el archivo equivalente en `docs/es/` en el mismo cambio; `docs/en/` y `docs/es/` deben contener siempre el mismo conjunto de archivos.

### Ejecutar un único archivo de pruebas

`pnpm test -- <archivo>` **no filtra** — el script `test` del backend usa un glob sobre todos los `tests/*.test.ts`, así que pasar un nombre de archivo ejecuta la suite completa. Ejecuta exactamente un archivo con:

```sh
pnpm --filter @bioplatform/backend test:one tests/<archivo>.test.ts
```

### Verificación de fiabilidad de tooling

`pnpm tooling:check` ejecuta un oráculo diagnóstico que informa, por sonda, el código de salida real y las cuentas de bytes de stdout/stderr por separado: presencia de git/node/pnpm, el contrato de `rtk rewrite`, presencia del `.env` del repo, alcance de la BD de pruebas, ejecución de una suite de muestra y aislamiento de la ejecución dirigida. Sale con código distinto de cero cuando falla una compuerta del repo y escribe un informe JSON completo en el directorio temporal del sistema. Úsalo cuando la salida de una herramienta/agente parezca truncada, vacía o engañosa durante una remediación.

Opcional pero recomendado antes de fusionar: `semgrep --config=p/typescript`, `gitleaks detect --source .` y `trivy image` sobre las imágenes construidas.

## Mensajes de Commit

- Escribe los mensajes en inglés, en modo imperativo, y describe el cambio, no el archivo.
- Referencia el issue o la tarea cuando sea aplicable.
- Mantén los mensajes concisos: un resumen de una línea y, si hace falta, un cuerpo corto.

Ejemplos:

```
Fix avatar upload crash
Add theme preset selector
Refactor terminal command editor grid
```

No hagas commit de archivos generados o modificados por máquinas salvo que el cambio lo requiera.

## Pull Requests

1. Crea una rama de características desde `main`.
2. Implementa tu cambio siguiendo los [Estándares de Código](#estándares-de-código).
3. Ejecuta las [Pruebas y Controles de Calidad](#pruebas-y-controles-de-calidad).
4. Rebasea tu rama sobre el `main` más reciente y verifica el diff squash final.
5. Abre un pull request con el resumen del cambio, la motivación y cómo verificarlo.

Los mantenedores pueden solicitar cambios; atiéndelos en commits posteriores, no reescribiendo historia una vez comenzada la revisión.

## Reportar Issues

- Reporta issues en GitHub con un título preciso en inglés.
- Incluye pasos claros para reproducir, comportamiento esperado frente al real y los detalles de entorno relevantes (SO, navegador, versión de Docker).
- Reporta los issues de seguridad de forma privada a los mantenedores en lugar de abrir un issue público.

---

← [Despliegue](./deployment.md) · [Volver Arriba](#contribuir)