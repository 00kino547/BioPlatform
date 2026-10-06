import type { ReactNode } from "react";
import { card, cardDesc, cardTitle, sectionHead, toggle, toggleKnob } from "@/components/ui/dashboard-tokens";

export function Toggle({
  on,
  onChange,
  onColorClass = "bg-violet-600",
}: {
  on: boolean;
  onChange: () => void;
  onColorClass?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onChange}
      className={toggle(on, onColorClass)}
    >
      <span className={toggleKnob(on)} />
    </button>
  );
}

export function SectionCard({
  icon,
  title,
  desc,
  className = "",
  dataTestId,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  desc?: string;
  className?: string;
  dataTestId?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${card} ${className}`} data-testid={dataTestId}>
      {(title || icon) && (
        <div className={sectionHead}>
          {icon}
          <div className="min-w-0">
            {title && <h3 className={cardTitle}>{title}</h3>}
            {desc && <p className={cardDesc}>{desc}</p>}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}