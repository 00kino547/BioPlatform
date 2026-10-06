# Storage Migration

Use the **`storage:migrate`** CLI to move uploads between any pair of configured providers: local ↔ S3 ↔ R2 ↔ B2, or S3 → S3 (e.g. when moving to a different bucket or region).

## Prerequisites

Prepare two **storage descriptors**. A descriptor can be a path to a JSON file or an inline JSON string:

```json
{
  "kind": "local",
  "root": "./uploads"
}
```

```json
{
  "kind": "s3",
  "endpoint": "https://<account>.r2.cloudflarestorage.com",
  "region": "auto",
  "accessKeyId": "YOUR_ACCESS_KEY",
  "secretAccessKey": "YOUR_SECRET_KEY",
  "bucket": "my-bucket",
  "prefix": "bio/uploads",
  "forcePathStyle": false
}
```

```json
{
  "kind": "b2",
  "applicationKeyId": "YOUR_KEY_ID",
  "applicationKey": "YOUR_APPLICATION_KEY",
  "bucket": "my-b2-bucket",
  "prefix": "bio/uploads",
  "apiUrl": "https://api.backblazeb2.com"
}
```

- `kind` must be `local`, `s3`, `r2` or `b2`.
- For `local`, use `root`.
- For `s3`/`r2`, you may omit `endpoint` (AWS), `region`, `forcePathStyle` and `prefix` depending on your provider.
- For `b2`, `applicationKeyId` and `applicationKey` are required; `apiUrl` and `prefix` are optional.

## Usage

```bash
pnpm --filter @bioplatform/backend storage:migrate --from <source> --to <dest> [options]
```

| Option | Description |
|--------|-------------|
| `--from <source>` | Source provider descriptor (path or JSON). |
| `--to <dest>` | Destination provider descriptor (path or JSON). |
| `--dry-run` | Print the migration plan without writing anything. |
| `--verify` *(default)* | Re-read each copied object and compare a SHA-256 of the decompressed content; exit code `1` on any mismatch. |
| `--no-verify` | Skip the hash comparison for speed. |
| `--delete-source` | Remove each object from the source after a successful copy. |
| `--recompress` | Accepted for compatibility; compression is decided automatically by `STORAGE_COMPRESS_ENABLED` and the destination provider. |

### Example: local → R2

Write `r2.json` with your R2 descriptor, then:

```bash
pnpm --filter @bioplatform/backend storage:migrate \
  --from '{"kind":"local","root":"./uploads"}' \
  --to ./r2.json \
  --verify
```

### Example: S3 → S3 (bucket change)

```bash
pnpm --filter @bioplatform/backend storage:migrate \
  --from ./bucket-a.json \
  --to ./bucket-b.json \
  --delete-source
```

### Recommended workflow

1. Run with `--dry-run` first to review the plan.
2. Run with `--verify` (default). An exit code of `1` means something failed and you should **not** delete the source.
3. Only then re-run with `--delete-source` to free the source, or delete the source manually.

## Notes

- The source is listed (paginated) and copied object by object.
- Compression on the destination follows `STORAGE_COMPRESS_ENABLED` only for cloud destinations; local files are always stored raw.
- Verification compares the **decompressed** content, so an already-gzipped source compares correctly against an uncompressed or compressed destination.
