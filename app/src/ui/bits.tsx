import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./kit";

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-panel-2 p-1">
      {options.map(o => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-full px-3.5 py-1.5 text-sm transition-colors cursor-pointer",
            value === o.value ? "bg-accent text-white shadow" : "text-ink-dim hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pick({ className, changed, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { changed?: boolean; children: ReactNode }) {
  return (
    <select
      className={cn("w-full cursor-pointer truncate rounded-lg border bg-panel-2 px-2 py-1.5 text-sm text-ink outline-none transition-colors hover:border-accent-hi/60 focus:border-accent-hi",
        changed ? "border-accent-hi/50 bg-accent/15" : "border-line", className)}
      {...p}>
      {children}
    </select>
  );
}

export function Delta({ v, className }: { v: number; className?: string }) {
  if (!v) return <span className={cn("text-xs text-ink-dim/60", className)}>±0</span>;
  return <span className={cn("text-xs font-medium tabular-nums", v > 0 ? "text-good" : "text-bad", className)}>{v > 0 ? "+" : ""}{v}</span>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-dim">
      <span className="size-3 animate-spin rounded-full border-2 border-accent-hi/30 border-t-accent-hi" />{label}
    </span>
  );
}
