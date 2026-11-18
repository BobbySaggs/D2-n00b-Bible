import { ARMOR_SLOTS, STAT_ORDER, type ClassName, type Slot, type StatKey } from "../bungie/config";
import { zeroStats, type Stats } from "../model/inventory";
import { pieceStats, type MwMode, type Piece } from "./armor";

// What a build wants from each stat. Value grows fastest up to 100 (ability cooldowns), slower 100 to 200
// (the stat's bonus effect), and anything under the floor is punished hard so no ability gets dumped.
export interface StatWant {
  floor: number;
  low: number; // value per point 0 to 100
  high: number; // value per point 100 to 200
}
export type StatPlan = Record<StatKey, StatWant>;

export interface SolveOptions {
  cls: ClassName;
  exotic?: string; // required exotic by name (any copy, old or new), or undefined for "no exotic"
  plan: StatPlan;
  bonus: Stats; // from fragments and other subclass picks
  mw: MwMode; // "asIs" = real stats today, "full" = if every Tier 3+ piece were masterworked
  mods?: number; // general stat mods available (one per piece)
  wornIds?: Set<string>; // tie-break toward fewer swaps
  keepPerSlot?: number;
  top?: number;
  minPower?: number; // armor below this needs infusing: legendary pieces are skipped, exotic copies only if no better copy exists
}

export interface Solution {
  pieces: Record<Slot, Piece>;
  mods: StatKey[]; // one +10 per piece, by piece order
  stats: Stats;
  score: number;
  swaps: number;
}

export const FLOOR_PENALTY = 6;

export function statValue(v: number, w: StatWant): number {
  const c = Math.min(v, 200);
  return w.low * Math.min(c, 100) + w.high * Math.max(0, c - 100) - FLOOR_PENALTY * Math.max(0, w.floor - v);
}

export function planValue(s: Stats, plan: StatPlan): number {
  let t = 0;
  for (const k of STAT_ORDER) t += statValue(s[k], plan[k]);
  return t;
}

// Gives each +10 stat mod to the stat that gains the most. The value curve is concave above the floor,
// so this greedy pass is optimal there; below a floor it naturally fills the floor first.
export function placeMods(raw: Stats, plan: StatPlan, n: number): { stats: Stats; mods: StatKey[] } {
  const s = { ...raw };
  const mods: StatKey[] = [];
  for (let i = 0; i < n; i++) {
    let best: StatKey = "health", gain = -Infinity;
    for (const k of STAT_ORDER) {
      if (s[k] >= 200) continue;
      const g = statValue(s[k] + 10, plan[k]) - statValue(s[k], plan[k]);
      if (g > gain) { gain = g; best = k; }
    }
    if (gain <= 0) break;
    s[best] += 10;
    mods.push(best);
  }
  return { stats: s, mods };
}

const pieceWeight = (st: Stats, plan: StatPlan) => STAT_ORDER.reduce((t, k) => t + st[k] * (plan[k].low + plan[k].floor / 100), 0);

export function solve(all: Piece[], o: SolveOptions): Solution[] {
  const K = o.keepPerSlot ?? 10, nMods = o.mods ?? 5, top = o.top ?? 5;
  const minP = o.minPower ?? 0;
  const mine = all.filter(p => p.item.cls === o.cls && (p.exotic || p.item.power >= minP));
  let exo = o.exotic ? mine.filter(p => p.exotic && p.item.name === o.exotic) : [];
  if (exo.some(p => p.item.power >= minP)) exo = exo.filter(p => p.item.power >= minP);
  if (o.exotic && !exo.length) return [];
  const exoSlot = exo[0]?.slot;

  // Per slot, keep the strongest pieces for this plan, plus the best piece for each stat,
  // so a floor can always be met by the right piece even if it scores low overall.
  const pools: Piece[][] = ARMOR_SLOTS.map(slot => {
    const cands = slot === exoSlot ? exo : mine.filter(p => p.slot === slot && !p.exotic);
    const scored = cands.map(p => ({ p, st: pieceStats(p, o.mw), w: 0 }));
    for (const c of scored) c.w = pieceWeight(c.st, o.plan) + (o.wornIds?.has(c.p.item.id) ? 0.01 : 0);
    scored.sort((a, b) => b.w - a.w);
    const keep = new Set(scored.slice(0, K).map(c => c.p));
    for (const k of STAT_ORDER) {
      const best = [...scored].sort((a, b) => b.st[k] - a.st[k])[0];
      if (best) keep.add(best.p);
    }
    return [...keep];
  });
  if (pools.some(p => !p.length)) return [];

  const statsOf = new Map<Piece, Stats>();
  for (const pool of pools) for (const p of pool) statsOf.set(p, pieceStats(p, o.mw));

  const out: Solution[] = [];
  const raw = zeroStats();
  const pick: Piece[] = [];
  const walk = (i: number) => {
    if (i === pools.length) {
      for (const k of STAT_ORDER) raw[k] = o.bonus[k];
      for (const p of pick) { const s = statsOf.get(p)!; for (const k of STAT_ORDER) raw[k] += s[k]; }
      const { stats, mods } = placeMods(raw, o.plan, nMods);
      const swaps = o.wornIds ? pick.filter(p => !o.wornIds!.has(p.item.id)).length : 0;
      const score = planValue(stats, o.plan) - swaps * 0.001;
      if (out.length < top || score > out[out.length - 1].score) {
        out.push({ pieces: Object.fromEntries(pick.map(p => [p.slot, p])) as Record<Slot, Piece>, mods, stats, score, swaps });
        out.sort((a, b) => b.score - a.score);
        if (out.length > top) out.pop();
      }
      return;
    }
    for (const p of pools[i]) { pick.push(p); walk(i + 1); pick.pop(); }
  };
  walk(0);
  return out;
}

export const count100 = (s: Stats) => STAT_ORDER.filter(k => s[k] >= 100).length;
export const lowest = (s: Stats) => Math.min(...STAT_ORDER.map(k => s[k]));
