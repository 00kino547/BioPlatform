import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { CheckCircle2, Send } from "lucide-react";
import { api } from "@/lib/api";

interface NewsletterSubscribeFormProps {
  profileId: string;
  heading?: string | null;
  accent: string;
  textColor: string;
  mutedColor: string;
}

export function NewsletterSubscribeForm({ profileId, heading, accent, textColor, mutedColor }: NewsletterSubscribeFormProps) {
  // All copy on this form lives in the "profile" namespace under "newsletter".
  const { t } = useTranslation("profile");
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  const canSubmit = email.trim().length > 0 && email.includes("@") && agree && status !== "sending";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("sending");
    try {
      const res = await api.subscribeNewsletter(profileId, email.trim());
      if (res.success) {
        setStatus("done");
        setMessage(t("newsletter.subscribed"));
      } else {
        setStatus("error");
        setMessage(res.error ?? t("newsletter.genericError"));
      }
    } catch {
      setStatus("error");
      setMessage(t("newsletter.genericError"));
    }
  };

  return (
    <div
      className="w-full rounded-xl px-4 py-4 mt-6"
      style={{ backgroundColor: `${accent}0a`, border: `1px solid ${accent}22` }}
    >
      <p className="text-sm font-semibold" style={{ color: textColor }}>
        {heading?.trim() || t("newsletter.defaultHeading")}
      </p>
      {status === "done" ? (
        <div className="mt-2 flex items-center gap-2 text-sm" style={{ color: "#22c55e" }}>
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{message}</span>
        </div>
      ) : (
        <>
          <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("newsletter.emailPlaceholder")}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm outline-none transition-colors focus:border-violet-500"
              style={{ color: textColor }}
            />
            <label className="flex items-start gap-2 text-xs leading-relaxed" style={{ color: mutedColor }}>
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5 accent-violet-500"
              />
              <span>
                <Trans
                  ns="profile"
                  i18nKey="newsletter.consent"
                  components={{
                    terms: (
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity" style={{ color: accent }} />
                    ),
                    privacy: (
                      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 transition-opacity" style={{ color: accent }} />
                    ),
                  }}
                />
              </span>
            </label>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: accent, color: textColor === "#fff" ? "#18181b" : "#fff" }}
            >
              <Send className="h-4 w-4" />
              {t("newsletter.subscribe")}
            </button>
            {status === "error" && <p className="text-xs" style={{ color: "#ef4444" }}>{message}</p>}
          </form>
        </>
      )}
    </div>
  );
}