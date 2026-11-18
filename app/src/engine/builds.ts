import { STAT_HASH, STAT_ORDER, type StatKey } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import { zeroStats, type Inventory, type Item, type Stats } from "../model/inventory";
import { byName, ELEMENT, HUNTER, MAX_FRAGMENTS, SUBCLASSES, WEAPON_TYPE, type K, type Subclass } from "../knowledge/hunter";
import { readPiece, type Piece } from "./armor";
import { scoreLoops, statLean, type Goal, type LoopReport, type Part } from "./loops";
import { solve, type Solution, type StatPlan } from "./solve";

export interface Weapon {
  item: Item;
  ks: K[]; // knowledge that applies: the weapon itself and its perks
  element: string;
  ammo: number; // 1 primary, 2 special, 3 heavy
}

export interface Build {
  goal: Goal;
  subclass: Subclass;
  super: K; grenade: K; melee: K; classAbility: K;
  aspects: K[]; fragments: K[];
  exotic: K;
  weapons: Weapon[];
  loops: LoopReport;
  score: number;
  armor?: Solution;
  bonus: Stats;
}

type DefOf = (h: number) => ItemDef | undefined;

const LIGHT: Subclass[] = ["Gunslinger", "Arcstrider", "Nightstalker"];

// What the Hunter can actually equip: Light subclass options are free for everyone; Stasis, Strand and
// Prismatic use Tyler's unlocks (plus anything already socketed, since Bungie's flags can lag).
export function availableKit(inv: Inventory, defOf: DefOf, characterId: string): Map<Subclass, Set<string>> {
  const out = new Map<Subclass, Set<string>>();
  for (const sub of SUBCLASSES) {
    const names = new Set<string>();
    if (LIGHT.includes(sub)) HUNTER.filter(k => k.subs?.includes(sub)).forEach(k => names.add(k.name));
    const item = inv.items.find(i => i.kind === "subclass" && i.owner === characterId && i.name === sub);
    if (item) {
      for (const h of item.plugs) { const d = defOf(h); if (d?.name) names.add(d.name); }
      for (const list of Object.values(item.options)) for (const h of list) { const d = defOf(h); if (d?.name) names.add(d.name); }
    }
    if (item || LIGHT.includes(sub)) out.set(sub, names);
  }
  return out;
}

export function ownedWeapons(inv: Inventory, defOf: DefOf, minPower = 400): Weapon[] {
  return inv.items
    .filter(i => i.kind === "weapon" && i.power >= minPower)
    .map(item => {
      const names = new Set<string>([item.name]);
      for (const h of item.plugs) { const d = defOf(h); if (d?.name) names.add(d.name); }
      const ks = [...names].map(n => byName.get(n)).filter((k): k is K => !!k && k.kind === "weapon");
      const type = WEAPON_TYPE[defOf(item.hash)?.type ?? ""];
      if (type) ks.push(type);
      return { item, ks, element: item.damage || "Kinetic", ammo: defOf(item.hash)?.ammo ?? 1 };
    });
}

// Stat changes from fragments, read from Bungie's plug data by name.
export function fragmentBonus(fragments: K[], defs: ItemDef[]): Stats {
  const bonus = zeroStats();
  const byStat = Object.fromEntries(STAT_ORDER.map(k => [STAT_HASH[k], k])) as Record<number, StatKey>;
  for (const f of fragments) {
    const d = defs.find(x => x.name === f.name && (x.plugCat.includes("fragments") || x.plugCat.includes("trinkets")));
    for (const [h, v] of d?.stats ?? []) if (byStat[h]) bonus[byStat[h]] += v;
  }
  return bonus;
}

// A stat point is worth this much loop score. Fragments that cost stats must earn it back in loops.
export const STAT_POINT = 0.15;
export const statTotal = (s: Stats) => STAT_ORDER.reduce((t, k) => t + s[k], 0);

export const pick = (kit: Set<string>, sub: Subclass, kind: K["kind"]) =>
  HUNTER.filter(k => k.kind === kind && k.subs?.includes(sub) && kit.has(k.name));

export const weaponParts = (ws: Weapon[]): Part[] => ws.flatMap(w => w.ks.map(k => ({ k })));

export type CoreLike = Pick<Build, "super" | "grenade" | "melee" | "classAbility" | "aspects" | "fragments" | "exotic">;
export function corePartsOf(b: CoreLike): Part[] {
  return [b.super, b.grenade, b.melee, b.classAbility, ...b.aspects, ...b.fragments, b.exotic].map(k => ({ k }));
}

function weaponFit(w: Weapon, sub: Subclass, exotic: K, goal: Goal): number {
  let s = 0;
  const el = ELEMENT[sub];
  if (w.element === el || (sub === "Prismatic Hunter" && w.element !== "Kinetic")) s += 1;
  if (exotic.name === "Fr0st-EE5" && w.element === "Stasis") s += 1.5;
  if (exotic.name === "Gyrfalcon's Hauberk" && w.element === "Void") s += 2;
  if (goal === "bossDps" && w.ammo === 2) {
    for (const k of w.ks) for (const m of k.makes) { const [t, n] = m.split(":"); if (t === "bossDmg") s += 1.5 * Number(n ?? 1); }
  }
  if (goal === "bossDps" && w.ammo === 3) {
    // The heavy weapon is the boss-damage weapon: judge it on its own damage perks, not the build's loops.
    for (const k of w.ks) for (const m of k.makes) { const [t, n] = m.split(":"); if (t === "bossDmg") s += 3 * Number(n ?? 1); }
  }
  s += w.item.power / 1000; // prefer higher Power copies
  return s;
}

function chooseWeapons(base: Part[], weapons: Weapon[], sub: Subclass, exotic: K, goal: Goal, pinned: Set<string> = new Set()): Weapon[] {
  const slots: ("kinetic" | "energy" | "power")[] = ["kinetic", "energy", "power"];
  const chosen: Weapon[] = [];
  for (const slot of slots) {
    const pin = weapons.find(w => w.item.slot === slot && pinned.has(w.item.id));
    if (pin) { chosen.push(pin); continue; }
    const cands = weapons.filter(w => w.item.slot === slot && !(w.item.exotic && chosen.some(c => c.item.exotic)));
    let best: Weapon | undefined, bestScore = -Infinity;
    for (const w of cands) {
      const sc = scoreLoops([...base, ...weaponParts([...chosen, w])], goal).score + weaponFit(w, sub, exotic, goal);
      if (sc > bestScore) { bestScore = sc; best = w; }
    }
    if (best) chosen.push(best);
  }
  return chosen;
}

export interface SearchInput {
  inv: Inventory;
  defOf: DefOf;
  defs: ItemDef[];
  characterId: string;
  goal: Goal;
  top?: number;
  onlySubclass?: Subclass;
  onlyExotic?: string;
  pinnedWeapons?: string[]; // weapon instance ids the player wants kept
}

export function searchBuilds(o: SearchInput): Build[] {
  const kit = availableKit(o.inv, o.defOf, o.characterId);
  const exotics = [...new Set(o.inv.items.filter(i => i.kind === "armor" && i.exotic && i.cls === "Hunter").map(i => i.name))]
    .map(n => byName.get(n)).filter((k): k is K => !!k && k.kind === "exotic")
    .filter(k => !o.onlyExotic || k.name === o.onlyExotic);
  const weapons = ownedWeapons(o.inv, o.defOf);

  // Stage 1: every core (super, grenade, melee, dodge, two aspects, exotic) scored on its loops.
  type Core = Omit<Build, "loops" | "score" | "armor" | "bonus" | "goal" | "weapons">;
  const cores: { c: Core; s: number }[] = [];
  for (const [sub, names] of kit) {
    if (o.onlySubclass && sub !== o.onlySubclass) continue;
    const supers = pick(names, sub, "super"), grenades = pick(names, sub, "grenade"), melees = pick(names, sub, "melee"),
      classes = pick(names, sub, "classAbility"), aspects = pick(names, sub, "aspect");
    const pairs: K[][] = [];
    for (let i = 0; i < aspects.length; i++) for (let j = i + 1; j < aspects.length; j++) pairs.push([aspects[i], aspects[j]]);
    if (!pairs.length && aspects.length) pairs.push([aspects[0]]);
    for (const su of supers) for (const g of grenades) for (const m of melees) for (const ca of classes) for (const asp of pairs) for (const ex of exotics) {
      const c: Core = { subclass: sub, super: su, grenade: g, melee: m, classAbility: ca, aspects: asp, fragments: [], exotic: ex };
      cores.push({ c, s: scoreLoops(corePartsOf(c), o.goal).score });
    }
  }
  cores.sort((a, b) => b.s - a.s);

  const fragCost = new Map<string, number>();
  // Stage 2: the best cores get fragments (greedy, best gain first) and weapons from the vault.
  const out: Build[] = [];
  const seen = new Set<string>();
  for (const { c } of cores.slice(0, 400)) {
    const frags = pick(kit.get(c.subclass)!, c.subclass, "fragment");
    const slots = Math.min(MAX_FRAGMENTS[c.subclass], c.aspects.reduce((t, a) => t + (a.slots ?? 2), 0));
    const chosen: K[] = [];
    for (let i = 0; i < slots; i++) {
      let best: K | undefined, gain = 0;
      const now = scoreLoops(corePartsOf({ ...c, fragments: chosen }), o.goal).score;
      for (const f of frags) {
        if (chosen.includes(f)) continue;
        const cost = fragCost.get(f.name) ?? (fragCost.set(f.name, statTotal(fragmentBonus([f], o.defs))), fragCost.get(f.name)!);
        const g = scoreLoops(corePartsOf({ ...c, fragments: [...chosen, f] }), o.goal).score - now + STAT_POINT * cost;
        if (g > gain) { gain = g; best = f; }
      }
      if (!best) break;
      chosen.push(best);
    }
    const core = { ...c, fragments: chosen };
    const ws = chooseWeapons(corePartsOf(core), weapons, c.subclass, c.exotic, o.goal, new Set(o.pinnedWeapons ?? []));
    const parts = [...corePartsOf(core), ...weaponParts(ws)];
    const loops = scoreLoops(parts, o.goal);
    const key = `${c.subclass}|${c.exotic.name}`;
    const bonus = fragmentBonus(chosen, o.defs);
    const b: Build = { ...core, goal: o.goal, weapons: ws, loops, score: loops.score + STAT_POINT * statTotal(bonus), bonus };
    out.push(b);
    void seen; void key;
  }
  out.sort((a, b) => b.score - a.score);
  // Keep one build per subclass + exotic so the list shows real alternatives.
  const distinct: Build[] = [];
  for (const b of out) {
    const key = `${b.subclass}|${b.exotic.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(b);
    if (distinct.length >= (o.top ?? 5)) break;
  }
  return distinct;
}

// Stat plan: every stat keeps a floor (no dumping), and the stats the loop leans on are pushed.
export function planFor(b: Pick<Build, "super" | "grenade" | "melee" | "classAbility" | "aspects" | "fragments" | "exotic" | "weapons">, goal: Goal, healthFloor?: number): StatPlan {
  const lean = statLean([...corePartsOf(b), ...weaponParts(b.weapons)], goal);
  const max = Math.max(...Object.values(lean), 0.01);
  const plan = {} as StatPlan;
  for (const k of STAT_ORDER) {
    const w = lean[k] / max; // 0..1
    const floor = k === "health" ? (healthFloor ?? (goal === "survival" || goal === "bossDps" ? 70 : 60)) : 50;
    // Every point counts (points past 100 still buy real bonuses); the loop's stats count more.
    plan[k] = { floor, low: 0.7 + 0.6 * w, high: 0.35 + 0.4 * w };
  }
  return plan;
}

export function fitArmor(b: Build, pieces: Piece[], o: { mw: "asIs" | "full"; wornIds?: Set<string>; minPower?: number }) {
  const plan = planFor(b, b.goal);
  return solve(pieces, { cls: "Hunter", exotic: b.exotic.name, plan, bonus: b.bonus, mw: o.mw, wornIds: o.wornIds, top: 1, minPower: o.minPower })[0];
}

export { readPiece };
