import type { ReactNode } from "react";
import { BNET, STAT_LABEL, STAT_ORDER, type Slot } from "../bungie/config";
import { DEFS } from "../bungie/defs";
import type { Item, Stats } from "../model/inventory";
import type { BuildView } from "../engine/evaluate";
import { cn } from "./kit";
import { GearIcon, iconForItem, iconForName } from "./gear";
import emblem from "../assets/emblem.webp";
import emblemSmall from "../assets/emblem_s.webp";
import mMug from "../assets/m_mug.webp";
import mPoint from "../assets/m_point.webp";
import mCheer from "../assets/m_cheer.webp";
import mGhost from "../assets/m_ghost.webp";
import mSit from "../assets/m_sit.webp";
import mStand from "../assets/m_stand.webp";
import mCrouch from "../assets/m_crouch.webp";

// Steeped's own art (the emblem and the mascot) plus the visual building blocks every screen shares.
export const BRAND = { emblem, emblemSmall };
const POSES = { mug: mMug, point: mPoint, cheer: mCheer, ghost: mGhost, sit: mSit, stand: mStand, crouch: mCrouch };
export type Pose = keyof typeof POSES;

export function Mascot({ pose, size = 96, className }: { pose: Pose; size?: number; className?: string }) {
  return <img src={POSES[pose]} alt="" aria-hidden width={size} height={size} className={cn("pointer-events-none select-none object-contain drop-shadow-[0_8px_20px_rgb(123_63_242/0.45)]", className)} style={{ width: size, height: size }} />;
}

// A mascot moment: loading, empty and done states.
export function Moment({ pose, title, children }: { pose: Pose; title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-line bg-panel p-5 backdrop-blur-sm">
      <Mascot pose={pose} size={84} />
      <div className="space-y-1"><div className="font-display text-xl font-semibold">{title}</div>{children && <div className="text-sm text-ink-dim">{children}</div>}</div>
    </div>
  );
}

// A progress ring with the number in the middle.
export function Ring({ pct, size = 120, label, sub, testId }: { pct: number; size?: number; label: string; sub?: string; testId?: string }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label} ${sub ?? ""}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(10 4 30 / 0.55)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#485cc7" /><stop offset="1" stopColor="#c5a8ff" /></linearGradient></defs>
      </svg>
      <div className="absolute text-center leading-tight">
        <div className="font-display font-semibold" style={{ fontSize: size * 0.26 }} data-testid={testId}>{label}</div>
        {sub && <div className="text-[11px] text-ink-dim">{sub}</div>}
      </div>
    </div>
  );
}

// Stats as bars, like the character screen: 0 to 200 with a mark at 100 (past 100 adds damage).
export function StatBars({ stats, compact }: { stats: Stats; compact?: boolean }) {
  return (
    <div className={cn("grid gap-x-5", compact ? "gap-y-1.5" : "gap-y-2.5", "sm:grid-cols-2")}>
      {STAT_ORDER.map(k => {
        const v = stats[k], hi = v >= 100, low = v < 60;
        return (
          <div key={k} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-sm text-ink-dim">{STAT_LABEL[k]}</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-panel-2" aria-hidden>
              <div className={cn("h-full rounded-full", hi ? "bg-gradient-to-r from-brand to-accent-hi" : low ? "bg-warn/80" : "bg-accent")} style={{ width: `${Math.min(100, v / 2)}%` }} />
              <span className="absolute inset-y-0 left-1/2 w-px bg-ink/40" />
            </div>
            <span className={cn("w-9 text-right font-display text-lg font-semibold tabular-nums", hi && "text-accent-hi", low && "text-warn")}>{v}</span>
          </div>
        );
      })}
    </div>
  );
}

const ARMOR: Slot[] = ["helmet", "arms", "chest", "legs", "class"];
const WEAPONS: Slot[] = ["kinetic", "energy", "power"];

// A loadout the way the game shows it: subclass and abilities on top, weapons left, armor right, with real icons.
export function LoadoutGrid({ subclass, abilities, weapons, armor, size = 56 }: { subclass?: Item; abilities: string[]; weapons: (Item | undefined)[]; armor: (Item | undefined)[]; size?: number }) {
  return (
    <div className="space-y-3" data-testid="loadout-grid">
      <div className="flex flex-wrap items-center gap-2">
        {subclass && <GearIcon src={iconForItem(subclass)} size={size} title={subclass.name} className="rounded-full" />}
        {abilities.filter(Boolean).map(n => <GearIcon key={n} src={iconForName(n)} size={Math.round(size * 0.66)} title={n} />)}
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-2">{weapons.map((w, i) => <Slot key={i} item={w} size={size} />)}</div>
        <div className="flex gap-2">{armor.map((a, i) => <Slot key={i} item={a} size={size} />)}</div>
      </div>
    </div>
  );
}
function Slot({ item, size }: { item?: Item; size: number }) {
  if (!item) return <span className="inline-block rounded-md border border-dashed border-line" style={{ width: size, height: size }} />;
  return <GearIcon src={iconForItem(item)} size={size} exotic={item.exotic} element={item.damage || undefined} title={item.name} mw={item.kind === "armor" ? item.masterworked : undefined} />;
}

export function gridFromView(v: BuildView) {
  return {
    abilities: [v.spec.super, v.spec.grenade, v.spec.melee, v.spec.classAbility],
    weapons: WEAPONS.map(s => v.weapons.find(w => w?.item.slot === s)?.item),
    armor: ARMOR.map(s => v.armor?.pieces[s as keyof NonNullable<typeof v.armor>["pieces"]]?.item),
  };
}
export function gridFromWorn(items: Item[], characterId: string) {
  const worn = items.filter(i => i.owner === characterId && i.equipped);
  const sub = worn.find(i => i.kind === "subclass");
  const plugs = sub ? sub.plugs.map(h => DEFS.get(h)).filter(d => d && /supers|grenades|melee|class_abilities/.test(d.plugCat)).map(d => d!.name) : [];
  return { subclass: sub, abilities: plugs, weapons: WEAPONS.map(s => worn.find(i => i.slot === s)), armor: ARMOR.map(s => worn.find(i => i.slot === s)) };
}

// The hero banner: your equipped emblem art behind your Hunter.
export function EmblemBanner({ bg, children }: { bg?: string; children: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-line" data-testid="hero">
      {bg && <img src={BNET + bg} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-55" />}
      <div className="absolute inset-0 bg-gradient-to-r from-bg-deep/95 via-bg-deep/75 to-bg-deep/30" aria-hidden />
      <div className="relative p-6 sm:p-7">{children}</div>
    </div>
  );
}

export const gradeClass = (g: string) => g === "Great" ? "bg-good/20 text-good border-good/40" : g === "Good" ? "bg-accent/25 text-accent-hi border-accent-hi/40" : "bg-warn/15 text-warn border-warn/40";
