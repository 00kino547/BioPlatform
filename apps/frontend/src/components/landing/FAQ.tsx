import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "@/components/layout/Container";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { branding } from "@/config/branding";

const faqs = [
  {
    question: `What is ${branding.name}?`,
    answer: `${branding.name} is a modern link-in-bio platform that lets you create a stunning profile page. Showcase your links, music, and social profiles in one beautifully designed page. It's built for creators, developers, and anyone who wants a polished digital presence.`,
  },
  {
    question: "Is it self-hostable?",
    answer: `Yes. ${branding.name} is fully open source and can be self-hosted on any Linux server with Docker. Our Docker Compose setup gets you running in minutes. You get full control over your data, storage, and deployment.`,
  },
  {
    question: "How does the invite system work?",
    answer: `${branding.name} is an invite-only platform. Accounts cannot be created freely. You can join by either receiving a handpicked invitation from our staff, or by being requested by an existing member and then manually approved before an invite is issued. This exclusivity ensures a high-quality community and prevents spam and abuse.`,
  },
  {
    question: "Can I use a custom domain?",
    answer: "Premium users can connect a custom domain to their profile page. We provide step-by-step instructions for DNS configuration, and SSL certificates are automatically provisioned via Let's Encrypt.",
  },
  {
    question: "What storage options are available?",
    answer: `${branding.name} supports local storage out of the box, with Cloudflare R2, Backblaze B2, and S3-compatible storage available as upgrade options. Choose the provider that fits your needs and budget.`,
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We use industry-standard encryption for all data at rest and in transit. Passwords are hashed with bcrypt, JWT tokens are used for authentication, and all file uploads are validated and sanitized.",
  },
];

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
  return (
    <section id="faq" className="py-24 sm:py-32 relative">
      <Container size="narrow">
        <ScrollReveal>
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-400 mb-4">
              FAQ
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              Frequently asked questions.
            </h2>
            <p className="mt-5 text-lg text-zinc-400">
              Everything you need to know about {branding.name}.
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/30 divide-y divide-zinc-800/60">
            {faqs.map((faq) => (
              <div key={faq.question} className="px-6 first:pt-1">
                <FAQItem {...faq} />
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
