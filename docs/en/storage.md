# Storage Providers

BioPlatform stores uploaded media (profile avatars, banners, custom background images, seasonal-theme backgrounds and music tracks) in object storage behind a small provider abstraction. The platform ships with three fully implemented providers — **local disk**, **S3-compatible object storage** and the **Backblaze B2 native API** — plus support for **Cloudflare R2** through the S3-compatible provider.

## Providers at a glance

| Provider | `STORAGE_PROVIDER` | Notes |
|----------|--------------------|-------|
| Local disk | `local` | Default. Files live in `LOCAL_STORAGE_PATH` (default `./uploads`). Served directly from disk. |
| AWS S3 | `s3` | Classic AWS S3 via the AWS SDK's S3-compatible API. |
| Cloudflare R2 | `r2` | R2 via the same S3-compatible API (egress is free). |
| MinIO / Wasabi / DO Spaces / Backblaze S3-compatible | `s3` | Any S3-compatible endpoint via `S3_ENDPOINT`. |
| Backblaze B2 native | `b2` | Backblaze B2 via the native B2 HTTP API (`B2_*` variables). No AWS SDK required. |

> R2 and S3 share one provider built on `@aws-sdk/client-s3` + `@aws-sdk/lib-storage`. `r2` and `s3` differ only in the label; everything else is configured through the same `S3_*` variables. The `b2` provider talks directly to the Backblaze B2 API (`b2_authorize_account`, `b2_get_upload_url`, `b2_upload_file`, etc.) using the platform's built-in fetch.

## How cloud storage works

When `STORAGE_PROVIDER` is `s3`, `r2` or `b2`:

1. **Uploads** — multer still writes the incoming file to a temp file on the local disk (`LOCAL_STORAGE_PATH`). On success the backend pushes the bytes to the cloud bucket (`S3_BUCKET` / `B2_BUCKET`) and deletes the local temp file. Large files use multipart upload via `@aws-sdk/lib-storage` on S3; the `b2` provider uploads with a single `b2_upload_file` call.
2. **Serving** — a request to `/uploads/<name>` first materializes the object into a local disk cache under `LOCAL_STORAGE_PATH/.media-cache/originals/` (keyed by a SHA-256 of provider + name), then serves it from there. Subsequent requests hit the disk cache. The `?w=` resize pipeline (WebP thumbnails) runs against that same cached original.
3. **Cache freshness** — the originals cache honors `MEDIA_CACHE_MAX_AGE_HOURS` (default 168); stale entries are re-fetched from the bucket transparently.
4. **Deletes** — replacing an avatar/banner/background or deleting a music track removes the object from the bucket (as well as any local temp + cached copy).
5. **Orphan cleanup** — the scheduled job (see `ORPHAN_CLEANUP_*`) lists actual bucket objects and deletes orphans from the bucket.

## At-rest compression

With `STORAGE_COMPRESS_ENABLED` (default `true`), every object written to a **cloud** provider is gzip-compressed (level 9, files ≥ 1 KB) before being stored. This typically reduces bucket size (and egress/C2C transfer costs on R2) significantly for images and audio. The read side detects gzip by the `1f 8b` magic bytes and decompresses transparently, so callers always get the original bytes.

- Local-disk uploads are **never** compressed (they are served straight from disk, avoiding a decompress on every read).
- Toggling the flag does **not** corrupt existing objects: gzip is detected by content magic, not by the configuration.
- Cost trade-off: saving bucket/egress bytes uses a little CPU per upload/read.

## Local disk cache limits

The `.media-cache` directory (originals for cloud providers + generated WebP thumbnails + the media proxy's image cache) is bounded:

- `MEDIA_CACHE_MAX_ENTRIES` (default `2000`) — max files.
- `MEDIA_CACHE_MAX_SIZE_MB` (default `512`) — max total size in MB.

During each orphan-cleanup pass, after the age-based prune, the oldest files (by mtime) are evicted until both limits are satisfied. This prevents unbounded disk growth when many profiles upload large backgrounds or many images are proxied.

## Configuration quick reference

| Variable | Purpose |
|----------|---------|
| `STORAGE_PROVIDER` | `local` \| `s3` \| `r2` \| `b2` |
| `S3_ENDPOINT` | S3-compatible endpoint URL. Empty = AWS S3. |
| `S3_REGION` | Region (or `auto`). |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | S3 credentials. |
| `S3_BUCKET` | Bucket (auto-created if missing). |
| `S3_PREFIX` | Optional key prefix. |
| `S3_FORCE_PATH_STYLE` | `true` for MinIO. |
| `B2_APPLICATION_KEY_ID` / `B2_APPLICATION_KEY` | B2 credentials. |
| `B2_BUCKET` | B2 bucket (auto-created if missing). |
| `B2_PREFIX` | Optional key prefix. |
| `B2_API_URL` | B2 API base URL (default `https://api.backblazeb2.com`). |
| `STORAGE_COMPRESS_ENABLED` | gzip at rest for cloud providers. |
| `MEDIA_CACHE_MAX_ENTRIES` / `MEDIA_CACHE_MAX_SIZE_MB` | Local cache caps. |

## Working with the CLI

To move uploads between providers (local ↔ S3 ↔ R2 ↔ B2, or S3 → S3 for a bucket/region change), see `docs/en/storage-migration.md`.
