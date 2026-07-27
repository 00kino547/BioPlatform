# Contribuir

## Primeros Pasos

1. Haz fork del repositorio
2. Clona tu fork
3. Crea una rama de características

```bash
git clone https://github.com/TU_USUARIO/BioPlatform.git
cd BioPlatform
cp .env.example .env
corepack enable
pnpm install
pnpm db:generate
pnpm db:seed
pnpm dev
```

## Desarrollo

### Estructura del Proyecto

```
apps/frontend/    # SPA React (Vite + TailwindCSS)
apps/backend/     # API Express (Prisma + PostgreSQL)
packages/shared/  # Tipos e interfaces de almacenamiento compartidos
```

### Estilo de Código

- TypeScript en modo estricto
- Sin comentarios a menos que se solicite
- Composición sobre archivos grandes
- Cada módulo independiente
- Alias de ruta `@/` mapea a `src/`
- Reutilizar componentes y patrones existentes

### Antes de Enviar

1. Ejecuta `pnpm --filter frontend exec tsc --noEmit` (verificación TypeScript)
2. Verifica que Docker funcione: `docker compose --profile nginx up -d --build`
3. Prueba tus cambios localmente

### Mensajes de Commit

- Usa mensajes claros y descriptivos
- Referencia issues cuando sea aplicable
- Ejemplos: `Corregir crash en subida de avatar`, `Agregar selector de temas`

## Pull Requests

1. Crea una rama de características desde `main`
2. Haz tus cambios
3. Asegúrate de que TypeScript compile limpiamente
4. Asegúrate de que Docker funcione correctamente
5. Envía un pull request con una descripción clara

## Reportar Issues

- Usa GitHub Issues
- Incluye pasos para reproducir
- Incluye detalles del entorno (SO, navegador, versión de Docker)
- Para issues de seguridad, contacta a los mantenedores en privado

## Arquitectura

Antes de cambiar código, lee:

1. `AGENTS.md` — reglas de código y seguridad
2. `PROJECT_MAP.md` — ubicación de archivos
3. `DECISIONS.md` — contexto de arquitectura

---

← [Despliegue](./deployment.md) · [Volver Arriba](#contribuir)
