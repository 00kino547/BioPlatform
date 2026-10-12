import { Megaphone } from "lucide-react";
import { useInstanceConfig } from "@/lib/useInstanceConfig";

// Reads config.yml `public.operational.announcement` (via GET /api/config).
// Renders nothing with an empty message (the zero-config default), so an
// instance without the field is completely unaffected. `href` is validated to
// http(s) server-side; sanitization strips HTML-like chars, and React escaping
// is the second barrier.
export function AnnouncementBanner() {
  const instance = useInstanceConfig();
  if (!instance) return null;

  const message = instance.operational.announcement.message.trim();
  if (!message) return null;

  const href = instance.operational.announcement.href.trim();
  const body = (
    <span className="inline-flex items-center justify-center gap-2 text-sm font-medium">
      <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </span>
  );

  // Sticky at the very top, above the navbar, so a maintenance notice is seen
  // no matter how far the visitor has scrolled.
  return (
    <div className="sticky top-0 z-50 w-full bg-violet-600/95 text-white backdrop-blur">
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full px-4 py-2 text-center hover:bg-violet-500 transition-colors"
        >
          {body}
        </a>
      ) : (
        <div className="w-full px-4 py-2 text-center">{body}</div>
      )}
    </div>
  );
}