import { useSearchParams } from "react-router-dom";
import { usePageMeta } from "@/lib/seo";
import { branding } from "@/config/branding";
import { InviteCreditStore } from "@/components/settings/InviteCreditStore";
import { asEmailHint } from "@/lib/emailHint";

// Public storefront for people who do not have an account yet.
//
// Registration is invite-only, so this page is the only way someone without an
// existing account can discover that invites can be bought. It therefore has to
// work with no session at all: no auth guard, no dashboard chrome, just the
// store and a way back to login.

export function InviteStore() {
  usePageMeta({
    title: `Get an invite — ${branding.name}`,
    description: `Buy an invite for ${branding.name}. Use your code to register; the rest come with your account.`,
  });

  /*
   * The register and login screens link here with the address the visitor already
   * typed, so following the link does not make them retype it. Only a plain
   * email is accepted; anything else is ignored rather than prefilled.
   */
  const [searchParams] = useSearchParams();
  const initialEmail = asEmailHint(searchParams.get("email") ?? "");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Get an invite
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
          {branding.name} is invite-only. Buy an invite credit below, then use one of the codes to
          register — anything you bought beyond the code you register with is added to your new
          account automatically.
        </p>
      </header>

      <InviteCreditStore showEmailField initialEmail={initialEmail} />

      <p className="mt-10 text-center text-sm text-zinc-500">
        Already have a code?{" "}
        <a href="/register" className="text-violet-400 transition-colors hover:text-violet-300">
          Register with it
        </a>{" "}
        or{" "}
        <a href="/login" className="text-violet-400 transition-colors hover:text-violet-300">
          sign in
        </a>
        .
      </p>
    </main>
  );
}