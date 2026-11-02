import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("invite");
  usePageMeta({
    title: t("inviteStore.metaTitle", { name: branding.name }),
    description: t("inviteStore.metaDescription", { name: branding.name }),
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
          {t("inviteStore.heading")}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400">
          {t("inviteStore.description", { name: branding.name })}
        </p>
      </header>

      <InviteCreditStore showEmailField initialEmail={initialEmail} />

      <p className="mt-10 text-center text-sm text-zinc-500">
        {t("inviteStore.alreadyHaveCode")}{" "}
        <a href="/register" className="text-violet-400 transition-colors hover:text-violet-300">
          {t("inviteStore.registerWithIt")}
        </a>{" "}
        {t("inviteStore.or")}{" "}
        <a href="/login" className="text-violet-400 transition-colors hover:text-violet-300">
          {t("inviteStore.signIn")}
        </a>
        .
      </p>
    </main>
  );
}