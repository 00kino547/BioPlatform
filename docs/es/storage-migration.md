# Migración del almacenamiento

Use la CLI **`storage:migrate`** para mover subidas entre cualquier par de proveedores configurados: local ↔ S3 ↔ R2 ↔ B2, o S3 → S3 (por ejemplo, al cambiar a otro contenedor o región).

## Requisitos previos

Prepare dos **descriptores** de almacenamiento. Un descriptor puede ser una ruta a un archivo JSON o una cadena JSON en línea:

```json
{
  "kind": "local",
  "root": "./uploads"
}
```

```json
{
  "kind": "s3",
  "endpoint": "https://<cuenta>.r2.cloudflarestorage.com",
  "region": "auto",
  "accessKeyId": "TU_CLAVE_ACCESO",
  "secretAccessKey": "TU_CLAVE_SECRETA",
  "bucket": "mi-contenedor",
  "prefix": "bio/uploads",
  "forcePathStyle": false
}
```

```json
{
  "kind": "b2",
  "applicationKeyId": "TU_ID_CLAVE",
  "applicationKey": "TU_CLAVE_APLICACION",
  "bucket": "mi-contenedor-b2",
  "prefix": "bio/uploads",
  "apiUrl": "https://api.backblazeb2.com"
}
```

- `kind` debe ser `local`, `s3`, `r2` o `b2`.
- Para `local` use `root`.
- Para `s3`/`r2` puede omitir `endpoint` (AWS), `region`, `forcePathStyle` y `prefix` según su proveedor.
- Para `b2`, `applicationKeyId` y `applicationKey` son obligatorios; `apiUrl` y `prefix` son opcionales.

## Uso

```bash
pnpm --filter @bioplatform/backend storage:migrate --from <origen> --to <destino> [opciones]
```

| Opción | Descripción |
|--------|-------------|
| `--from <origen>` | Descriptor del proveedor de origen (ruta o JSON). |
| `--to <destino>` | Descriptor del proveedor de destino (ruta o JSON). |
| `--dry-run` | Muestra el plan de migración sin escribir nada. |
| `--verify` *(predeterminado)* | Vuelve a leer cada objeto copiado y compara un SHA-256 del contenido descomprimido; sale con código `1` si algo no coincide. |
| `--no-verify` | Omite la comparación de hash para mayor velocidad. |
| `--delete-source` | Elimina cada objeto del origen tras copiarlo correctamente. |
| `--recompress` | Aceptado por compatibilidad; la compresión se decide automáticamente según `STORAGE_COMPRESS_ENABLED` y el proveedor de destino. |

### Ejemplo: local → R2

Escriba `r2.json` con el descriptor de R2 y luego:

```bash
pnpm --filter @bioplatform/backend storage:migrate \
  --from '{"kind":"local","root":"./uploads"}' \
  --to ./r2.json \
  --verify
```

### Ejemplo: S3 → S3 (cambio de contenedor)

```bash
pnpm --filter @bioplatform/backend storage:migrate \
  --from ./bucket-a.json \
  --to ./bucket-b.json \
  --delete-source
```

### Práctica recomendada

1. Ejecute primero con `--dry-run` para revisar el plan.
2. Ejecute con `--verify` (predeterminado). Un código de salida `1` indica que algo falló y **no** debe eliminar el origen.
3. Solo después, repita con `--delete-source` para liberar el origen, o elimine el origen manualmente.

## Notas

- El origen se lista (paginado) y se copia objeto a objeto.
- La compresión de los objetos en el destino sigue `STORAGE_COMPRESS_ENABLED` solo para destinos de nube; los archivos locales siempre se almacenan sin comprimir.
- La verificación compara el contenido **descomprimido**, por lo que un origen que ya está gzip se compara correctamente contra su destino sin comprimir o comprimido.
