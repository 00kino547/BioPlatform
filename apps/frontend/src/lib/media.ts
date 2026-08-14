type MediaFormat = "webp" | "jpeg" | "png";

const BANNER_WIDTHS = [480, 960, 1440];
const AVATAR_WIDTHS = [96, 160, 256];

export function mediaUrl(src: string | null | undefined, opts: { w: number; f?: MediaFormat }): string {
  if (!src || !src.startsWith("/uploads/")) return src ?? "";
  const f = opts.f ?? "webp";
  return `${src}?w=${opts.w}&f=${f}`;
}

export function bannerSrcSet(src: string): string {
  return BANNER_WIDTHS.map((w) => `${mediaUrl(src, { w })} ${w}w`).join(", ");
}

export function avatarSrcSet(src: string): string {
  return AVATAR_WIDTHS.map((w) => `${mediaUrl(src, { w })} ${w}w`).join(", ");
}
