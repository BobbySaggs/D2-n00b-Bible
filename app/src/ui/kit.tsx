import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-accent/85 shadow-[0_6px_24px_-8px_rgb(123_63_242/0.8)]",
        ghost: "bg-panel text-ink hover:bg-white/10 border border-line",
        quiet: "text-ink-dim hover:text-ink",
      },
      size: { md: "h-11 px-5 text-[15px]", sm: "h-9 px-4 text-sm", lg: "h-13 px-7 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export function Button({ className, variant, size, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...p} />;
}

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-line bg-panel p-5 backdrop-blur-sm", className)} {...p} />;
}

const badge = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", {
  variants: {
    tone: {
      neutral: "bg-white/10 text-ink-dim",
      good: "bg-good/15 text-good",
      warn: "bg-warn/15 text-warn",
      exotic: "bg-exotic/15 text-exotic",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export function Badge({ tone, children, className }: VariantProps<typeof badge> & { children: ReactNode; className?: string }) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-ink-dim">{label}</div>
      <div className="font-display text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-ink-dim">{hint}</div>}
    </div>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="#2a1466" />
      <path d="M22 12h20l8 10v26a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V22z" fill="#ece4ff" stroke="#1a0b3d" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="32" cy="21" r="3.5" fill="#1a0b3d" />
      <path d="M23 30l9 7 9-7M23 40l9 7 9-7" fill="none" stroke="#5b2fd6" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
