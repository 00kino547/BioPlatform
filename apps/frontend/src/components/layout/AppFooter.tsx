import { Link } from "react-router-dom";
import { VersionBadge } from "@/components/updates/VersionBadge";
import { branding } from "@/config/branding";

export function AppFooter() {
  return (
    <footer className="border-t border-zinc-800/60 bg-zinc-900/20">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6 lg:px-8">
        <p className="text-xs text-zinc-600">
          &copy; {new Date().getFullYear()} {branding.name}. All rights reserved.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <VersionBadge />
          <Link to="/privacy" className="text-xs text-zinc-500 hover:text-white transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="text-xs text-zinc-500 hover:text-white transition-colors">
            Terms
          </Link>
          <Link to="/api-docs" className="text-xs text-zinc-500 hover:text-white transition-colors">
            API
          </Link>
          <a
            href={branding.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-500 hover:text-white transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
