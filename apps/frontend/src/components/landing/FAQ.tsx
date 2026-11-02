import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { branding } from "@/config/branding";
import { BuyInviteModal } from "@/components/invites/BuyInviteModal";
import { usePolicyContext } from "@/lib/usePolicyContext";

/** Stable id for the invite-system entry, whose answer changes with the store. */
const INVITE_ITEM_ID = "q2";

/**
 * Items are keyed by id (not the translated question) so translation can never
 * break the "is this the invite question?" check below. `name` interpolates the
 * branding name into the copy.
 */
function useFaqItems(storeOpen: boolean) {
  const { t } = useTranslation("landing");
  return [
    { id: "q0", question: t("faq.items.q0", { name: branding.name }), answer: t("faq.items.a0", { name: branding.name }) },
    { id: "q1", question: t("faq.items.q1"), answer: t("faq.items.a1", { name: branding.name }) },
    {
      id: INVITE_ITEM_ID,
      question: t("faq.items.q2"),
      // Stated from the live policy context rather than hardcoded: with the paid
      // store open, claiming the only route in is a handpicked invitation would be
      // false, and it would hide the way to actually buy one.
      answer: storeOpen
        ? t("faq.items.a2StoreOpen", { name: branding.name })
        : t("faq.items.a2Default", { name: branding.name }),
    },
    { id: "q3", question: t("faq.items.q3"), answer: t("faq.items.a3") },
    { id: "q4", question: t("faq.items.q4"), answer: t("faq.items.a4", { name: branding.name }) },
    { id: "q5", question: t("faq.items.q5"), answer: t("faq.items.a5") },
  ];
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="group">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center justify-between py-5 text-left cursor-pointer transition-colors",
          isOpen ? "text-white" : "text-zinc-300 hover:text-white"
        )}
        aria-expanded={isOpen}
      >
        <span className="text-[15px] font-medium pr-4">{question}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-300 ease-out",
            isOpen && "rotate-180 text-violet-400"
          )}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          isOpen ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <p className="text-sm text-zinc-400 leading-relaxed pb-5 pr-8">
          {answer}
        </p>
      </div>
    </div>
  );
}

export function FAQ() {
  const { t } = useTranslation("landing");
  const ctx = usePolicyContext();
  const storeOpen = ctx?.invites?.purchaseEnabled === true;
  const faqs = useFaqItems(storeOpen);

  return (
    <section id="faq" className="py-24 sm:py-32 relative">
      <Container size="narrow">
        <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-4">
              {t("faq.eyebrow")}
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              {t("faq.heading")}
            </h2>
            <p className="mt-5 text-lg text-zinc-400">
              {t("faq.subtitle", { name: branding.name })}
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60">
            {faqs.map((faq) => (
              <div key={faq.id} className="px-6 first:pt-1">
                <FAQItem question={faq.question} answer={faq.answer} />
                {/*
                  An answer that tells people they can buy an invite needs the way
                  to do it on the same screen, not just a link they have to guess at.
                */}
                {storeOpen && faq.id === INVITE_ITEM_ID ? (
                  <div className="pb-5">
                    <BuyInviteModal />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
