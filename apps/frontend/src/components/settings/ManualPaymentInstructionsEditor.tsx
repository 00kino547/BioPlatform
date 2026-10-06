import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Save, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";

/**
 * The contact channels an operator can publish for out-of-band payments.
 *
 * Mirrors `CONTACT_METHODS` in the backend. `none` is first because it is the
 * state that means "no instructions published".
 */
const CONTACT_METHODS = ["none", "email", "telegram", "discord", "whatsapp"] as const;

/**
 * Editor for the instance's "pay by hand" instructions.
 *
 * These live in one shared setting (`orders.contactMethod` / `orders.contactValue`)
 * used by both the plan checkout and the paid invite store, so this component is
 * rendered in the Orders tab and in the invite store admin card. Before this
 * existed the invite store offered "Pay by hand" to buyers with no way for the
 * operator to say where to send the money.
 */
export function ManualPaymentInstructionsEditor() {
  const [method, setMethod] = useState<string>("none");
  const [value, setValue] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getOrdersConfig();
      if (res.success && res.data) {
        setMethod(res.data.method);
        setValue(res.data.value);
      }
    } catch {
      setError("Could not load the manual payment instructions");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setMsg("");
    setError("");
    setSaving(true);
    try {
      const res = await api.updateOrdersConfig({ method, value });
      if (res.success && res.data) {
        // Re-read rather than trusting local state: the server blanks the value
        // when the method is `none`, and the form must show that.
        setMethod(res.data.method);
        setValue(res.data.value);
        setMsg("Saved");
      } else {
        setError(res.error ?? "Could not save the instructions");
      }
    } catch {
      setError("Could not save the instructions");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-violet-400" aria-hidden />
        <h3 className="text-sm font-medium text-white">Pay-by-hand instructions</h3>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Shown to buyers who choose &quot;pay by hand&quot;, on both plan purchases and invite credits.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="manual-pay-method" className="mb-1.5 block text-xs text-zinc-400">
            Method
          </label>
          <select
            id="manual-pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {CONTACT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m === "none" ? "None (not configured)" : m[0].toUpperCase() + m.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="manual-pay-value" className="mb-1.5 block text-xs text-zinc-400">
            Contact details (email address, @handle, phone&hellip;)
          </label>
          <input
            id="manual-pay-value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={300}
            disabled={method === "none"}
            placeholder="owner@example.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      {/*
        The dead-end warning is the whole point of this control: with no
        instructions published the storefront hides the manual option, so a
        half-finished setting silently removes a payment method.
      */}
      {method === "none" || !value.trim() ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            No instructions are published, so buyers cannot choose &quot;pay by hand&quot;. Choose a method and
            enter the details to enable it.
          </span>
        </p>
      ) : null}

      {msg && !error && (
        <p role="status" className="mt-3 text-xs text-emerald-400">
          {msg}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs text-red-400">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save className="h-4 w-4" aria-hidden />
        {saving ? "Saving…" : "Save instructions"}
      </button>
    </div>
  );
}