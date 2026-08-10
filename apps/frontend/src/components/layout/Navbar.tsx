import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X, LayoutDashboard } from "lucide-react";
import { Container } from "@/components/layout/Container";
import { cn } from "@/lib/utils";
import { branding } from "@/config/branding";
import { useAuth } from "@/contexts/AuthContext";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#showcase" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div
        className={cn(
          "absolute inset-0 transition-all duration-300",
          scrolled
            ? "bg-background/70 backdrop-blur-xl border-b border-zinc-800/60 shadow-lg shadow-black/20"
            : "bg-transparent"
        )}
      />
      <Container className="relative">
        <nav className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-violet-500/25 transition-shadow group-hover:shadow-violet-500/40">
              {branding.name.charAt(0)}
            </div>
            <span className="text-base font-semibold text-white tracking-tight">
              {branding.name}
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-0.5">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="px-3.5 py-2 text-[13px] font-medium text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/api-docs"
              className="px-3.5 py-2 text-[13px] font-medium text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              API Docs
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg font-medium bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-600/20 transition-all"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg font-medium bg-violet-600 text-white hover:bg-violet-700 shadow-lg shadow-violet-600/20 transition-all"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden relative z-10 p-2 -mr-2 text-zinc-400 hover:text-white transition-colors"
            aria-label="Toggle menu"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </Container>

      <div
        className={cn(
          "md:hidden absolute top-16 inset-x-0 transition-all duration-300 origin-top",
          isOpen
            ? "opacity-100 scale-y-100 pointer-events-auto"
            : "opacity-0 scale-y-95 pointer-events-none"
        )}
      >
        <div className="bg-background/95 backdrop-blur-xl border-b border-zinc-800/60 shadow-xl shadow-black/30">
          <Container>
            <div className="py-4 flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-2.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
                >
                  {link.label}
                </a>
              ))}
              <Link
                to="/api-docs"
                onClick={() => setIsOpen(false)}
                className="px-3 py-2.5 text-sm font-medium text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                API Docs
              </Link>
              <div className="mt-3 pt-3 border-t border-zinc-800/60 flex flex-col gap-2">
                {user ? (
                  <Link
                    to="/dashboard"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg font-medium bg-violet-600 text-white hover:bg-violet-700 transition-all"
                  >
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setIsOpen(false)}
                      className="inline-flex items-center justify-center gap-2 h-8 px-3 text-xs rounded-lg font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-all"
                    >
                      Sign In
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setIsOpen(false)}
                      className="inline-flex items-center justify-center gap-2 h-8 w-full px-3 text-xs rounded-lg font-medium bg-violet-600 text-white hover:bg-violet-700 transition-all"
                    >
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </div>
          </Container>
        </div>
      </div>
    </header>
  );
}
