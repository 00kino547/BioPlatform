import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { branding } from "@/config/branding";
import { Button } from "@/components/ui/button";
import { usePageMeta } from "@/lib/seo";
import { AppFooter } from "@/components/layout/AppFooter";

type RegisterField = "username" | "email" | "password" | "inviteCode";
type RegisterFieldErrors = Partial<Record<RegisterField, string>>;

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  usePageMeta({ title: "Create Account", description: `Create a free account on ${branding.name} and get your own profile page.`, url: "/register" });
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [loading, setLoading] = useState(false);

  const clearFieldError = (field: RegisterField) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validate = (): RegisterFieldErrors => {
    const errors: RegisterFieldErrors = {};
    if (!username) errors.username = "Username is required.";
    else if (username.length < 3) errors.username = "Username must be at least 3 characters.";
    else if (username.length > 32) errors.username = "Username must be 32 characters or fewer.";
    else if (!/^[a-z0-9_-]+$/.test(username)) {
      errors.username = "Username can only contain lowercase letters, numbers, underscores, and hyphens.";
    }

    if (!email.trim()) errors.email = "Email is required.";
    else if (email.length > 254) errors.email = "Email must be 254 characters or fewer.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) errors.email = "Email must be a valid email address.";

    if (!password) errors.password = "Password is required.";
    else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
    else if (password.length > 128) errors.password = "Password must be 128 characters or fewer.";

    if (!inviteCode.trim()) errors.inviteCode = "Invite code is required.";
    else if (inviteCode.length > 128) errors.inviteCode = "Invite code must be 128 characters or fewer.";
    return errors;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const validationErrors = validate();
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);

    const result = await register({ username, email, password, inviteCode });
    setLoading(false);

    if (result.error || result.fieldErrors) {
      setError(result.error ?? "Please fix the highlighted fields.");
      setFieldErrors(result.fieldErrors ?? {});
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-bold text-white tracking-tight">
            {branding.name}
          </Link>
          <p className="mt-2 text-sm text-zinc-400">Create your account</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8 space-y-5"
        >
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="inviteCode" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Invite Code
            </label>
            <input
              id="inviteCode"
              type="text"
              required
              value={inviteCode}
              maxLength={128}
              onChange={(e) => {
                setInviteCode(e.target.value);
                clearFieldError("inviteCode");
              }}
              aria-invalid={Boolean(fieldErrors.inviteCode)}
              aria-describedby={fieldErrors.inviteCode ? "inviteCode-error" : undefined}
              className={`w-full rounded-lg border ${fieldErrors.inviteCode ? "border-red-500/70" : "border-zinc-800"} bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono`}
              placeholder="Enter your invite code"
            />
            {fieldErrors.inviteCode && <p id="inviteCode-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.inviteCode}</p>}
            <p className="mt-1.5 text-xs text-zinc-500">
              Registration is invite-only. Get a code from an existing member.
            </p>
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Username
            </label>
            <input
              id="username"
              type="text"
              required
              value={username}
              onChange={(e) => {
                setUsername(e.target.value.toLowerCase());
                clearFieldError("username");
              }}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? "username-error" : undefined}
              className={`w-full rounded-lg border ${fieldErrors.username ? "border-red-500/70" : "border-zinc-800"} bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 font-mono`}
              placeholder="your-username"
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9_-]+"
            />
            {fieldErrors.username && <p id="username-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.username}</p>}
            <p className="mt-1.5 text-xs text-zinc-500">
              Your profile will be at {new URL(branding.url).host}/<span className="text-zinc-400">{username || "username"}</span>
            </p>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              maxLength={254}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("email");
              }}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              className={`w-full rounded-lg border ${fieldErrors.email ? "border-red-500/70" : "border-zinc-800"} bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30`}
              placeholder="you@example.com"
            />
            {fieldErrors.email && <p id="email-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              maxLength={128}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("password");
              }}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              className={`w-full rounded-lg border ${fieldErrors.password ? "border-red-500/70" : "border-zinc-800"} bg-zinc-900/50 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30`}
              placeholder="Min. 8 characters"
            />
            {fieldErrors.password && <p id="password-error" className="mt-1.5 text-xs text-red-400">{fieldErrors.password}</p>}
          </div>

          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link to="/login" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
            Sign in
          </Link>
        </p>
      </div>
      </div>
      <AppFooter />
    </div>
  );
}
