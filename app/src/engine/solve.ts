import { ARMOR_SLOTS, STAT_ORDER, type ClassName, type Slot, type StatKey } from "../bungie/config";
import { zeroStats, type Stats } from "../model/inventory";
import { pieceStats, type MwMode, type Piece, type TuneOpt } from "./armor";

// What a build wants from each stat. Value grows fastest up to 100 (ability cooldowns), slower 100 to 200
// (the stat's bonus effect), and anything under the floor is punished hard so no ability gets dumped.
export interface StatWant {
  floor: number;
  low: number; // value per point 0 to 100
  high: number; // value per point 100 to 200
  peak?: number; // "Most 100s": extra pull from 70 toward 100, plus a bonus for crossing it
  hard?: boolean; // the player asked for this floor ("Keep at 100+"): falling short costs far more
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
  locks?: Partial<Record<Slot, string>>; // item ids the player picked for a slot
  minPower?: number; // armor below this needs infusing: legendary pieces are skipped, exotic copies only if no better copy exists
  tune?: boolean; // also try every tuning plug each piece can take
}

export interface Solution {
  pieces: Record<Slot, Piece>;
  mods: StatKey[]; // one +10 per piece, by piece order
  stats: Stats;
  score: number;
  swaps: number;
  tuning: Partial<Record<Slot, TuneOpt>>; // tuning changes Steeped suggests (only pieces whose tuning should change)
}

export const FLOOR_PENALTY = 6;

export function statValue(v: number, w: StatWant): number {
  const c = Math.min(v, 200);
  // Monument of Triumph: cooldowns are nearly maxed at 70 (2.56x vs 2.75x at 100), so 70 to 100 is worth about half.
  const pen = FLOOR_PENALTY * (w.hard ? 6 : 1);
  let t = w.low * Math.min(c, 70) + 0.5 * w.low * Math.min(30, Math.max(0, c - 70)) + w.high * Math.max(0, c - 100) - pen * Math.max(0, w.floor - v);
  t -= FLOOR_PENALTY * 6 * Math.max(0, -v); // a stat below 0 just wastes points the game throws away
  if (w.peak) t += w.peak * (Math.min(30, Math.max(0, c - 70)) + (c >= 100 ? 12 : 0));
  return t;
}

export function planValue(s: Stats, plan: StatPlan): number {
  let t = 0;
  for (const k of STAT_ORDER) t += statValue(s[k], plan[k]);
  return t;
}

// Gives each +10 stat mod to the stat that gains the most. The value curve is concave above the floor,
// so this greedy pass is optimal there; below a floor it naturally fills the floor first.
export function placeMods(raw: Stats, plan: StatPlan, n: number, exact = false): { stats: Stats; mods: StatKey[] } {
  if (exact) return placeModsExact(raw, plan, n);
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

// Every way to spread n mods over six stats (252 for five mods): exact when the value curve has a jump at 100.
const SPREADS = new Map<number, number[][]>();
function spreads(n: number): number[][] {
  if (SPREADS.has(n)) return SPREADS.get(n)!;
  const out: number[][] = [];
  const rec = (i: number, left: number, cur: number[]) => {
    if (i === 5) { out.push([...cur, left]); return; }
    for (let x = 0; x <= left; x++) { cur.push(x); rec(i + 1, left - x, cur); cur.pop(); }
  };
  rec(0, n, []);
  SPREADS.set(n, out);
  return out;
}
function placeModsExact(raw: Stats, plan: StatPlan, n: number): { stats: Stats; mods: StatKey[] } {
  let best: number[] = [], bestV = -Infinity;
  const base = STAT_ORDER.map(k => statValue(raw[k], plan[k]));
  for (const sp of spreads(n)) {
    let v = 0;
    for (let i = 0; i < 6; i++) { const k = STAT_ORDER[i]; v += sp[i] ? statValue(raw[k] + 10 * sp[i], plan[k]) : base[i]; }
    if (v > bestV) { bestV = v; best = sp; }
  }
  const stats = { ...raw }, mods: StatKey[] = [];
  best.forEach((c, i) => { for (let j = 0; j < c; j++) { stats[STAT_ORDER[i]] += 10; mods.push(STAT_ORDER[i]); } });
  return { stats, mods };
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
    const lockId = o.locks?.[slot];
    const locked = lockId ? all.filter(p => p.item.id === lockId) : [];
    const cands = locked.length ? locked : slot === exoSlot ? exo : mine.filter(p => p.slot === slot && !p.exotic);
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

  // With "Most 100s" the value jumps at 100, so greedy mod placement can miss a two-mod crossing.
  // Fast pass: greedy for every combination; then exact placement (all 252 mod spreads) on the best 60.
  const peaks = STAT_ORDER.some(k => o.plan[k].peak);
  const keep = peaks ? Math.max(60, top) : o.tune ? Math.max(25, top) : top;
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
      if (out.length < keep || score > out[out.length - 1].score) {
        out.push({ pieces: Object.fromEntries(pick.map(p => [p.slot, p])) as Record<Slot, Piece>, mods, stats, score, swaps, tuning: {}, raw: { ...raw } } as Solution);
        out.sort((a, b) => b.score - a.score);
        if (out.length > keep) out.pop();
      }
      return;
    }
    for (const p of pools[i]) { pick.push(p); walk(i + 1); pick.pop(); }
  };
  walk(0);
  // Tuning: for each leading set, try every tuning plug on each piece (a few passes, keeping any gain).
  if (o.tune) {
    for (const sol of out) {
      const r = (sol as Solution & { raw: Stats }).raw;
      const val = (raw2: Stats) => planValue(placeMods(raw2, o.plan, nMods, peaks).stats, o.plan);
      let bestV = val(r);
      for (let pass = 0; pass < 2; pass++) {
        let changed = false;
        for (const p of Object.values(sol.pieces)) {
          const now = sol.tuning[p.slot] ? pieceStats(p, o.mw, sol.tuning[p.slot]) : statsOf.get(p)!;
          let pick: { t: TuneOpt; r2: Stats; v: number } | undefined;
          for (const t of p.tunings) {
            const st = pieceStats(p, o.mw, t);
            const r2 = { ...r };
            for (const k of STAT_ORDER) r2[k] += st[k] - now[k];
            const v = val(r2);
            if (v > (pick?.v ?? bestV) + 0.01) pick = { t, r2, v };
          }
          if (pick) { bestV = pick.v; Object.assign(r, pick.r2); sol.tuning[p.slot] = pick.t; changed = true; }
        }
        if (!changed) break;
      }
      // Drop "changes" that land on the plug the piece already has.
      for (const [s, t] of Object.entries(sol.tuning)) if (t && sol.pieces[s as Slot].item.plugs[sol.pieces[s as Slot].tuneSocket] === t.hash) delete sol.tuning[s as Slot];
      const placed = placeMods(r, o.plan, nMods, peaks);
      sol.stats = placed.stats; sol.mods = placed.mods; sol.score = planValue(placed.stats, o.plan) - sol.swaps * 0.001;
    }
    out.sort((a, b) => b.score - a.score);
  }
  if (peaks && !o.tune) {
    for (const sol of out) {
      const r = (sol as Solution & { raw: Stats }).raw;
      const { stats, mods } = placeMods(r, o.plan, nMods, true);
      sol.stats = stats; sol.mods = mods; sol.score = planValue(stats, o.plan) - sol.swaps * 0.001;
    }
    out.sort((a, b) => b.score - a.score);
  }
  for (const sol of out) delete (sol as Partial<Solution & { raw: Stats }>).raw;
  return out.slice(0, top);
}

export const count100 = (s: Stats) => STAT_ORDER.filter(k => s[k] >= 100).length;
export const lowest = (s: Stats) => Math.min(...STAT_ORDER.map(k => s[k]));
