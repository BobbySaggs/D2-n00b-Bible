import { STAT_HASH, STAT_ORDER, type Slot, type StatKey } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import { zeroStats, type Item, type Stats } from "../model/inventory";

// Armor 3.0 piece, read from its plugs (verified on Tyler's account Nov 18, 2026):
// - base: the three "armor_stats" plugs (Tier 5: 30 / 25 / 20)
// - masterwork: "Upgrade Armor" plug; level 1 to 5 adds +1 per level to the three stats the piece didn't roll
// - tuning (Tier 5): Balanced (+1 to the three off stats) or +5 / -5
// - one general stat mod (+10 major, +5 minor)
export interface Piece {
  item: Item;
  slot: Slot;
  exotic: boolean;
  tier: number;
  archetype: string;
  base: Stats; // before masterwork, tuning and mods
  mwLevel: number; // 0 to 5
  legacy: boolean; // pre-Armor 3.0: no stat plugs, stats read as shown minus mods
  tuning: Stats; // current tuning plug contribution
  mod: Stats; // current general stat mod contribution
  current: Stats; // what the game shows for this piece now
}

const BY_HASH = Object.fromEntries(STAT_ORDER.map(k => [STAT_HASH[k], k])) as Record<number, StatKey>;
const plugStats = (d: ItemDef | undefined): Stats => {
  const s = zeroStats();
  for (const [h, v] of d?.stats ?? []) if (BY_HASH[h]) s[BY_HASH[h]] += v;
  return s;
};
const add = (a: Stats, b: Stats): Stats => {
  const s = zeroStats();
  for (const k of STAT_ORDER) s[k] = a[k] + b[k];
  return s;
};

export function readPiece(item: Item, defOf: (h: number) => ItemDef | undefined): Piece | null {
  if (item.kind !== "armor" || !item.slot) return null;
  let base = zeroStats(), tuning = zeroStats(), mod = zeroStats(), mwLevel = 0, archetype = "", statPlugs = 0;
  for (const h of item.plugs) {
    const d = defOf(h);
    if (!d) continue;
    if (d.plugCat === "armor_stats") { base = add(base, plugStats(d)); statPlugs++; }
    else if (d.plugCat === "armor_archetypes") archetype = d.name;
    else if (d.plugCat.includes("armor_tiering.plugs.tuning")) tuning = plugStats(d);
    else if (d.plugCat === "enhancements.v2_general") mod = plugStats(d);
    else if (d.plugCat.includes("plugs.armor.masterworks") && d.plugCat.endsWith("masterworks"))
      mwLevel = Math.max(0, ...d.stats.filter(([h]) => BY_HASH[h]).map(([, v]) => v));
  }
  // Missing stat plugs on modern armor (definition didn't load): rebuild the base from what the game shows.
  if (item.gearTier >= 1 && statPlugs > 0 && statPlugs < 3) {
    const shown = zeroStats();
    for (const k of STAT_ORDER) shown[k] = Math.max(0, item.stats[k] - mod[k]);
    const off = [...STAT_ORDER].sort((a, b) => shown[a] - shown[b]).slice(0, 3);
    const balanced = STAT_ORDER.every(k => tuning[k] === 1);
    base = zeroStats();
    for (const k of STAT_ORDER) {
      let v = shown[k];
      if (off.includes(k)) v -= (item.masterworked ? 5 : mwLevel) + (balanced && item.gearTier >= 5 ? 1 : 0);
      else if (!balanced) v -= tuning[k];
      base[k] = Math.max(0, v);
    }
  }
  const legacy = statPlugs === 0;
  if (legacy) {
    // Older armor: take the shown stats, minus the stat mod, as its base. Its masterwork is already inside.
    base = zeroStats();
    for (const k of STAT_ORDER) base[k] = Math.max(0, item.stats[k] - mod[k]);
    mwLevel = 0;
  }
  if (item.masterworked && !legacy) mwLevel = 5;
  return { item, slot: item.slot, exotic: item.exotic, tier: item.gearTier, archetype, base, mwLevel, legacy, tuning, mod, current: item.stats };
}

// The three stats a piece didn't roll get the masterwork bonus.
export function masterworkBonus(p: Piece, level: number): Stats {
  const s = zeroStats();
  if (p.legacy || level <= 0) return s;
  for (const k of offStats(p)) s[k] = level;
  return s;
}

export type MwMode = "asIs" | "full";

const offStats = (p: Piece) => [...STAT_ORDER].sort((a, b) => p.base[a] - p.base[b]).slice(0, 3);

// Tuning as the game applies it. Balanced Tuning's plug lists +1 on all six; it lands on the three off stats.
export function tuningStats(p: Piece, which: "current" | "balanced"): Stats {
  const s = zeroStats();
  if (p.legacy || p.tier < 5) return s;
  const vals = STAT_ORDER.map(k => p.tuning[k]);
  const balanced = which === "balanced" || vals.every(v => v === 1);
  if (balanced) { for (const k of offStats(p)) s[k] = 1; return s; }
  return { ...p.tuning };
}

// Piece stats before the general stat mod.
export function pieceStats(p: Piece, mw: MwMode, tuning: "current" | "balanced" = "current"): Stats {
  const level = mw === "full" && p.tier >= 3 ? 5 : p.mwLevel;
  return add(add(p.base, masterworkBonus(p, level)), tuningStats(p, tuning));
}
