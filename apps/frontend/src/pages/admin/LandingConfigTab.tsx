import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { api } from "@/lib/api";
import { branding } from "@/config/branding";

export function LandingConfigTab() {
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
        else setError(res.error ?? "Failed to load landing settings");
      })
      .catch(() => {
        if (live) setError("Failed to load landing settings");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

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
      setError(res.error ?? "Failed to save landing settings");
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 p-7 sm:p-8">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="h-5 w-5 text-violet-400" />
        <h2 className="text-lg font-semibold text-white">Landing settings</h2>
      </div>
      <p className="text-sm text-zinc-500 mb-6">
        Link a live profile from the marketing landing page. When set, the hero and the showcase preview editor
        show a <span className="text-zinc-300">View live profile</span> button pointing to{" "}
        <span className="text-zinc-300">/{username || "username"}</span>. Leave empty to hide the button.
      </p>

      <label className="block max-w-md">
        <span className="text-xs text-zinc-400">Featured profile username</span>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-sm text-zinc-500">/</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
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
          {saving ? "Saving…" : "Save"}
        </button>
        {username && (
          <a
            href={`/${username.replace(/^@/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            View /{username.replace(/^@/, "")}
          </a>
        )}
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {username && (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          <p>
            The landing page now links to <span className="font-semibold text-violet-400">/{username.replace(/^@/, "")}</span>.
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            The button appears on the {branding.name} hero and in the showcase preview editor, and uses your
            origin host by default.
          </p>
        </div>
      )}
    </div>
  );
}