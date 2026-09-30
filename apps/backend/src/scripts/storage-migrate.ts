import { createHash } from "crypto";
import fs from "fs";
import { createB2StorageProvider, type B2StorageConfig } from "../lib/storage/b2.js";
import { decompressIfNeeded } from "../lib/storage/compression.js";
import { createLocalStorageProvider } from "../lib/storage/local.js";
import { createS3StorageProvider, type S3StorageConfig } from "../lib/storage/s3.js";
import type { StorageProvider } from "../lib/storage/types.js";

type MigrationDescriptor =
  | { kind: "local"; root: string }
  | (S3StorageConfig & { kind: "s3" | "r2" })
  | B2StorageConfig;

function loadDescriptor(raw: string): MigrationDescriptor {
  const text = fs.existsSync(raw) ? fs.readFileSync(raw, "utf8") : raw;
  try {
    return JSON.parse(text) as MigrationDescriptor;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid storage descriptor: ${message}`);
  }
}

function createProviderFromDescriptor(config: MigrationDescriptor): StorageProvider {
  if (config.kind === "local") {
    return createLocalStorageProvider(config.root);
  }
  if (config.kind === "b2") {
    return createB2StorageProvider(config as B2StorageConfig);
  }
  return createS3StorageProvider(config as S3StorageConfig);
}

interface Args {
  from: string;
  to: string;
  dryRun: boolean;
  deleteSource: boolean;
  verify: boolean;
  recompress: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let i = 2;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      flags.dryRun = true;
      i += 1;
    } else if (arg === "--delete-source") {
      flags.deleteSource = true;
      i += 1;
    } else if (arg === "--no-verify") {
      flags.verify = false;
      i += 1;
    } else if (arg === "--verify") {
      flags.verify = true;
      i += 1;
    } else if (arg === "--recompress") {
      flags.recompress = true;
      i += 1;
    } else if (arg === "--from") {
      flags.from = argv[i + 1];
      i += 2;
    } else if (arg === "--to") {
      flags.to = argv[i + 1];
      i += 2;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  const from = flags.from ?? positional[0];
  const to = flags.to ?? positional[1];
  if (!from || !to) {
    throw new Error("Usage: storage-migrate --from <source> --to <dest> [--dry-run] [--delete-source] [--verify|--no-verify] [--recompress]");
  }

  return {
    from: String(from),
    to: String(to),
    dryRun: Boolean(flags.dryRun),
    deleteSource: Boolean(flags.deleteSource),
    verify: flags.verify !== false,
    recompress: Boolean(flags.recompress),
  };
}

function decompressedHash(data: Buffer): string {
  return createHash("sha256").update(decompressIfNeeded(data)).digest("hex");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const srcConfig = loadDescriptor(args.from);
  const destConfig = loadDescriptor(args.to);

  const src = createProviderFromDescriptor(srcConfig);
  const dest = createProviderFromDescriptor(destConfig);

  console.log(`Migration plan: ${srcConfig.kind} → ${destConfig.kind} (dry-run=${args.dryRun}, delete-source=${args.deleteSource}, verify=${args.verify}, recompress=${args.recompress})`);

  const objects = await src.listObjects();
  console.log(`Source contains ${objects.length} objects`);

  let copied = 0;
  let skipped = 0;
  let verified = 0;
  let failed = 0;

  for (const object of objects) {
    const destExisting = await dest.statObject(object.name).catch(() => null);
    if (destExisting && destExisting.size === object.size) {
      skipped += 1;
      continue;
    }

    if (args.dryRun) {
      console.log(`  [dry-run] ${object.name} (${(object.size / 1024).toFixed(1)} KB)`);
      copied += 1;
      continue;
    }

    const srcData = await src.readObject(object.name);
    if (!srcData) {
      console.error(`  [error] ${object.name}: failed to read source`);
      failed += 1;
      continue;
    }

    await dest.writeObject(object.name, srcData);

    if (args.verify) {
      const destData = await dest.readObject(object.name);
      if (!destData) {
        console.error(`  [error] ${object.name}: failed to read back from destination`);
        failed += 1;
        continue;
      }
      const srcHash = decompressedHash(srcData);
      const destHash = decompressedHash(destData);
      if (srcHash !== destHash) {
        console.error(`  [error] ${object.name}: hash mismatch after write`);
        failed += 1;
        continue;
      }
      verified += 1;
    }

    if (args.deleteSource) {
      await src.deleteObject(object.name).catch((error) => {
        console.error(`  [warn] ${object.name}: failed to delete source`, error);
      });
    }

    copied += 1;
    console.log(`  [done] ${object.name} (${(object.size / 1024).toFixed(1)} KB)`);
  }

  console.log(`\nMigration complete: copied=${copied} skipped=${skipped} verified=${verified} failed=${failed} dry-run=${args.dryRun}`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});