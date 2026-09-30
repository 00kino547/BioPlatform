# Proveedores de almacenamiento

BioPlatform almacena los medios subidos (avatares, portadas, imágenes de fondo personalizadas, fondos de temas estacionales y pistas de música) en almacenamiento de objetos detrás de una pequeña abstracción de proveedor. La plataforma incluye tres proveedores totalmente implementados — **disco local**, **almacenamiento de objetos compatible con S3** y la **API nativa de Backblaze B2** — además de soporte para **Cloudflare R2** mediante el proveedor compatible con S3.

## Proveedores de un vistazo

| Proveedor | `STORAGE_PROVIDER` | Notas |
|-----------|--------------------|-------|
| Disco local | `local` | Predeterminado. Los archivos viven en `LOCAL_STORAGE_PATH` (predeterminado `./uploads`). Se sirven directamente desde el disco. |
| AWS S3 | `s3` | AWS S3 clásico mediante la API compatible con S3 del SDK de AWS. |
| Cloudflare R2 | `r2` | R2 mediante la misma API compatible con S3 (egreso gratuito). |
| MinIO / Wasabi / DO Spaces / Backblaze compatible con S3 | `s3` | Cualquier punto final compatible con S3 mediante `S3_ENDPOINT`. |
| Backblaze B2 nativo | `b2` | Backblaze B2 mediante la API HTTP nativa de B2 (variables `B2_*`). No requiere el SDK de AWS. |

> R2 y S3 comparten un único proveedor construido sobre `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`. `r2` y `s3` solo difieren en la etiqueta; todo lo demás se configura con las mismas variables `S3_*`. El proveedor `b2` habla directamente con la API de Backblaze B2 (`b2_authorize_account`, `b2_get_upload_url`, `b2_upload_file`, etc.) usando el fetch integrado de la plataforma.

## Cómo funciona el almacenamiento en la nube

Cuando `STORAGE_PROVIDER` es `s3`, `r2` o `b2`:

1. **Subidas** — multer aún escribe el archivo entrante en un archivo temporal en el disco local (`LOCAL_STORAGE_PATH`). Al tener éxito, el backend envía los bytes al contenedor en la nube (`S3_BUCKET` / `B2_BUCKET`) y elimina el archivo temporal local. Los archivos grandes usan subida multiparte mediante `@aws-sdk/lib-storage` en S3; el proveedor `b2` sube con una única llamada `b2_upload_file`.
2. **Servicio** — una petición a `/uploads/<nombre>` primero materializa el objeto en una caché de disco local ubicada en `LOCAL_STORAGE_PATH/.media-cache/originals/` (clave basada en SHA-256 de proveedor + nombre) y luego lo sirve desde ahí. Las peticiones posteriores usan la caché de disco. El canal de redimensión `?w=` (miniaturas WebP) se ejecuta sobre el mismo original en caché.
3. **Vigencia de la caché** — la caché de originales respeta `MEDIA_CACHE_MAX_AGE_HOURS` (predeterminado 168); las entradas obsoletas se vuelven a obtener del contenedor de forma transparente.
4. **Eliminaciones** — reemplazar un avatar/portada/fondo o eliminar una pista de música retira el objeto del contenedor (además de cualquier copia temporal local o en caché).
5. **Limpieza de huérfanos** — la tarea programada (ver `ORPHAN_CLEANUP_*`) lista los objetos reales del contenedor y elimina los huérfanos del contenedor.

## Compresión en reposo

Con `STORAGE_COMPRESS_ENABLED` (predeterminado `true`), cada objeto escrito en un proveedor de **nube** se comprime con gzip (nivel 9, archivos ≥ 1 KB) antes de almacenarse. Esto reduce notablemente el tamaño del contenedor (y los costos de egreso/C2C en R2) para imágenes y audio. El lado de lectura detecta gzip por los bytes mágicos `1f 8b` y descomprime de forma transparente, por lo que los llamadores siempre obtienen los bytes originales.

- Las subidas en disco local **nunca** se comprimen (se sirven directamente desde el disco, evitando descomprimir en cada lectura).
- Cambiar el valor de la opción **no** corrompe los objetos existentes: gzip se detecta por el contenido mágico, no por la configuración.
- Costo: ahorrar bytes de contenedor/egreso usa un poco de CPU por subida/lectura.

## Límites de la caché de disco local

El directorio `.media-cache` (originales para proveedores de nube + miniaturas WebP generadas + la caché de imágenes del proxy de medios) está acotado:

- `MEDIA_CACHE_MAX_ENTRIES` (predeterminado `2000`) — archivos máximos.
- `MEDIA_CACHE_MAX_SIZE_MB` (predeterminado `512`) — tamaño total máximo en MB.

Durante cada pasada de limpieza de huérfanos, tras la poda por antigüedad, se eliminan los archivos más antiguos (por mtime) hasta satisfacer ambos límites. Esto evita un crecimiento ilimitado del disco cuando muchos perfiles suben fondos grandes o se proxean muchas imágenes.

## Referencia rápida de configuración

| Variable | Propósito |
|----------|-----------|
| `STORAGE_PROVIDER` | `local` \| `s3` \| `r2` \| `b2` |
| `S3_ENDPOINT` | URL del punto final compatible con S3. Vacío = AWS S3. |
| `S3_REGION` | Región (o `auto`). |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Credenciales S3. |
| `S3_BUCKET` | Contenedor (se crea automáticamente si no existe). |
| `S3_PREFIX` | Prefijo de clave opcional. |
| `S3_FORCE_PATH_STYLE` | `true` para MinIO. |
| `B2_APPLICATION_KEY_ID` / `B2_APPLICATION_KEY` | Credenciales B2. |
| `B2_BUCKET` | Contenedor B2 (se crea automáticamente si no existe). |
| `B2_PREFIX` | Prefijo de clave opcional. |
| `B2_API_URL` | URL base de la API B2 (predeterminado `https://api.backblazeb2.com`). |
| `STORAGE_COMPRESS_ENABLED` | gzip en reposo para proveedores de nube. |
| `MEDIA_CACHE_MAX_ENTRIES` / `MEDIA_CACHE_MAX_SIZE_MB` | Límites de la caché local. |

## Trabajar con la CLI

Para mover subidas entre proveedores (local ↔ S3 ↔ R2 ↔ B2, o S3 → S3 para cambiar de contenedor/región), consulte `docs/es/storage-migration.md`.
