import { useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Check, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { branding } from "@/config/branding";

export function LandingConfigTab() {
  // Admin tab that links the marketing landing page to a live profile.
  const { t } = useTranslation("admin");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api
      .getLandingConfig()
      .then((res) => {
        if (!live) return;
        if (res.success) setUsername(res.data?.featuredProfileUsername ?? "");
        else setError(res.error ?? t("admin.landingConfig.loadFailed"));
      })
      .catch(() => {
        if (live) setError(t("admin.landingConfig.loadFailed"));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [t]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    const res = await api.setLandingConfig(username.trim());
    setSaving(false);
    if (res.success) {
      setUsername(res.data?.featuredProfileUsername ?? "");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } else {
      setError(res.error ?? t("admin.landingConfig.saveFailed"));
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="h-5 w-5 text-violet-400" />
        <h2 className="text-lg font-semibold text-white">{t("admin.landingConfig.title")}</h2>
      </div>
      <p className="text-sm text-zinc-500 mb-6">
        <Trans
          ns="admin"
          i18nKey="admin.landingConfig.description"
          values={{ username: username || "username" }}
          components={{ code: <span className="text-zinc-300" /> }}
        >
          Link a live profile from the marketing landing page. When set, the hero and the showcase preview editor
          show a <code>View live profile</code> button pointing to <code>/{username}</code>. Leave empty to hide the button.
        </Trans>
      </p>

      <label className="block max-w-md">
        <span className="text-xs text-zinc-400">{t("admin.landingConfig.featuredUsername")}</span>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-zinc-500">/</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("admin.landingConfig.usernamePlaceholder")}
            disabled={loading}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none disabled:opacity-40"
          />
        </div>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={loading || saving}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 transition-colors disabled:opacity-40"
        >
          {saving ? t("admin.landingConfig.saving") : t("admin.landingConfig.save")}
        </button>
        {username && (
          <a
            href={`/${username.replace(/^@/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            {t("admin.landingConfig.viewProfile", { username: username.replace(/^@/, "") })}
          </a>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
            <Check className="h-4 w-4" /> {t("admin.landingConfig.saved")}
          </span>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {username && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          <p>
            <Trans
              ns="admin"
              i18nKey="admin.landingConfig.linkedTo"
              values={{ username: username.replace(/^@/, "") }}
              components={{ strong: <span className="font-semibold text-violet-400" /> }}
            >
              The landing page now links to <strong>/{username}</strong>.
            </Trans>
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            {t("admin.landingConfig.hostedNote", { name: branding.name })}
          </p>
        </div>
      )}
    </div>
  );
}