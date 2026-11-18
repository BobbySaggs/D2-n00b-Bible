import { useState } from "react";
import { BNET, type Slot } from "../bungie/config";
import { DEFS } from "../bungie/defs";
import type { Item } from "../model/inventory";
import type { BuildView } from "../engine/evaluate";
import { cn } from "./kit";
import silHunter from "../assets/sil-hunter.webp";

// Icons come straight from Bungie (displayProperties.icon on every item and plug definition).
const PLUG_CATS = /supers|grenades|melee|class_abilities|aspects|totems|fragments|trinkets|movement/;
let byName: Map<string, string> | null = null;
export function iconForName(name: string): string {
  if (!byName || byName.size === 0) {
    byName = new Map();
    for (const d of DEFS.values()) if (d.icon && d.name && (PLUG_CATS.test(d.plugCat) || (d.tier === 6 && d.itemType === 2))) if (!byName.has(d.name)) byName.set(d.name, d.icon);
  }
  return byName.get(name) ?? "";
}
export const iconForItem = (i?: Item) => (i ? DEFS.get(i.hash)?.icon ?? "" : "");

const ELEMENT_RING: Record<string, string> = {
  Kinetic: "ring-white/40", Arc: "ring-arc", Solar: "ring-solar", Void: "ring-void", Stasis: "ring-stasis", Strand: "ring-strand",
};

export function GearIcon({ src, size = 44, exotic, element, title, className }: { src: string; size?: number; exotic?: boolean; element?: string; title?: string; className?: string }) {
  const [bad, setBad] = useState(false);
  const initials = (title ?? "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2);
  return (
    <span title={title} style={{ width: size, height: size }}
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-panel-2 text-[10px] font-semibold text-ink-dim",
        exotic ? "ring-2 ring-exotic" : element ? cn("ring-1", ELEMENT_RING[element] ?? "ring-line") : "ring-1 ring-line", className)}>
      {src && !bad ? <img src={BNET + src} alt="" loading="lazy" className="size-full object-cover" onError={() => setBad(true)} /> : initials}
    </span>
  );
}

const ARMOR_ORDER: Slot[] = ["helmet", "arms", "chest", "legs", "class"];

// A build laid out like the character screen: weapons left, armor right, subclass on top.
export function LoadoutFigure({ v, compact }: { v: BuildView; compact?: boolean }) {
  const s = compact ? 34 : 44;
  const kit = [v.spec.super, v.spec.grenade, v.spec.melee, v.spec.classAbility];
  return (
    <div className="space-y-2" data-testid="loadout-figure">
      <div className="flex flex-wrap items-center gap-1.5">
        {kit.map(n => n && <GearIcon key={n} src={iconForName(n)} size={compact ? 26 : 30} title={n} />)}
        <span className="mx-1 h-5 w-px bg-line" />
        {v.spec.aspects.map(n => <GearIcon key={n} src={iconForName(n)} size={compact ? 22 : 26} title={n} />)}
        {v.spec.fragments.map(n => <GearIcon key={n} src={iconForName(n)} size={compact ? 18 : 22} title={n} className="rounded-full" />)}
      </div>
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <div className="flex flex-col gap-2">
          {v.weapons.map((w, i) => (
            <GearIcon key={i} src={iconForItem(w?.item)} size={s} exotic={w?.item.exotic} element={w?.element} title={w ? `${w.item.name} · ${w.element} · Power ${w.item.power}` : "Empty"} />
          ))}
        </div>
        <div className="flex justify-center">
          <img src={silHunter} alt="" aria-hidden className={cn("pointer-events-none select-none opacity-90 drop-shadow-[0_0_24px_rgba(123,63,242,0.45)]", compact ? "h-36" : "h-48")} />
        </div>
        <div className="flex flex-col gap-1">
          {ARMOR_ORDER.map(slot => {
            const p = v.armor?.pieces[slot];
            return <GearIcon key={slot} src={iconForItem(p?.item)} size={compact ? 28 : 34} exotic={p?.exotic} title={p ? `${p.item.name} · T${p.tier} ${p.archetype}` : slot} />;
          })}
        </div>
      </div>
    </div>
  );
}
