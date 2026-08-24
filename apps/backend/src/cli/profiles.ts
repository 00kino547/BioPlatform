import { prisma } from "../lib/prisma.js";
import { upsertPrimaryProfile } from "../lib/profile.js";
import { updateProfileSchema } from "../lib/validation.js";
import { die, flagBool, flagString, parseArgs, printJson, resolveUserId } from "./shared.js";

const CLEAR = "none";

function clearable(flags: Record<string, string | boolean>, key: string): string | null | undefined {
  const raw = flagString(flags, key);
  if (raw === undefined) return undefined;
  return raw === CLEAR ? null : raw;
}

export async function runProfiles(argv: string[]): Promise<void> {
  const [subcommand] = argv;
  if (!subcommand || subcommand === "help") die("usage: bioplatform profiles <list|show|edit> ...");

  switch (subcommand) {
    case "list":
      return profilesList(argv[1]);
    case "show":
      return profilesShow(argv[1], parseArgs(argv.slice(2)));
    case "edit":
      return profilesEdit(argv[1], parseArgs(argv.slice(2)));
    default:
      die(`unknown profiles subcommand "${String(subcommand)}"`);
  }
}

async function targetProfileId(userId: string, args: ReturnType<typeof parseArgs>): Promise<string | null> {
  const profileId = flagString(args.flags, "profile-id");
  if (!profileId) return null;
  const owned = await prisma.profile.findFirst({ where: { id: profileId, userId }, select: { id: true } });
  if (!owned) die(`profile ${profileId} not found for this user`);
  return owned.id;
}

async function profilesList(identifier?: string): Promise<void> {
  if (!identifier) die("usage: bioplatform profiles list <identifier>");
  const userId = await resolveUserId(identifier);
  const profiles = await prisma.profile.findMany({
    where: { userId },
    select: {
      id: true,
      slug: true,
      isPrimary: true,
      displayName: true,
      location: true,
      isPublic: true,
      _count: { select: { aliases: true, musicTracks: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { slug: "asc" }],
  });
  printJson(profiles.map(({ _count, ...p }) => ({ ...p, aliases: _count.aliases, tracks: _count.musicTracks })));
}

async function profilesShow(identifier?: string, args?: ReturnType<typeof parseArgs>): Promise<void> {
  if (!identifier || !args) die("usage: bioplatform profiles show <identifier> [--profile-id <uuid>]");
  const userId = await resolveUserId(identifier);
  const forcedId = await targetProfileId(userId, args);
  const profile = forcedId
    ? await prisma.profile.findUnique({ where: { id: forcedId } })
    : await prisma.profile.findFirst({ where: { userId, isPrimary: true } });
  if (!profile) die("no profile found");
  const aliases = await prisma.profileAlias.findMany({
    where: { profileId: profile.id },
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  printJson({ ...profile, aliases: aliases.map((a) => a.slug) });
}

async function profilesEdit(identifier?: string, args?: ReturnType<typeof parseArgs>): Promise<void> {
  if (!identifier || !args) {
    die(
      [
        "usage: bioplatform profiles edit <identifier> [--profile-id <uuid>]",
        "  [--display-name <text|" + CLEAR + "]",
        "  [--bio <text|" + CLEAR + "]",
        "  [--location <text|" + CLEAR + "]",
        "  [--website <url|" + CLEAR + "]",
        "  [--public] [--private]]",
      ].join(" ")
    );
  }

  const input: Record<string, unknown> = {};
  const displayName = clearable(args.flags, "display-name");
  if (displayName !== undefined) input.displayName = displayName;
  const bio = clearable(args.flags, "bio");
  if (bio !== undefined) input.bio = bio;
  const location = clearable(args.flags, "location");
  if (location !== undefined) input.location = location;
  const website = clearable(args.flags, "website");
  if (website !== undefined) input.website = website;
  if (flagBool(args.flags, "public")) input.isPublic = true;
  if (flagBool(args.flags, "private")) input.isPublic = false;

  if (Object.keys(input).length === 0) die("nothing to do: pass at least one field flag");

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    die(parsed.error.issues[0]?.message ?? "invalid profile fields");
  }

  const userId = await resolveUserId(identifier);
  const forcedId = await targetProfileId(userId, args);
  const data = {
    displayName: parsed.data.displayName,
    bio: parsed.data.bio,
    location: parsed.data.location,
    website: parsed.data.website,
    isPublic: parsed.data.isPublic,
  };

  const updated = forcedId
    ? await prisma.profile.update({ where: { id: forcedId }, data })
    : await upsertPrimaryProfile(userId, data);
  printJson({
    id: updated.id,
    slug: updated.slug,
    isPrimary: updated.isPrimary,
    displayName: updated.displayName,
    bio: updated.bio,
    location: updated.location,
    website: updated.website,
    isPublic: updated.isPublic,
  });
}
