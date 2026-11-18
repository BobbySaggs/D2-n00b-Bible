import { ARMOR_SLOTS, type Slot } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import type { Inventory, Stats } from "../model/inventory";
import { byName, MAX_FRAGMENTS, type K, type Subclass } from "../knowledge/hunter";
import { readPiece, type MwMode, type Piece } from "./armor";
import { availableKit, corePartsOf, fragmentBonus, ownedWeapons, planFor, statTotal, weaponParts, type Build, type Weapon } from "./builds";
import { scoreLoops, type Goal, type LoopReport } from "./loops";
import { count100, lowest, solve, type Solution } from "./solve";

// A build the player can edit: everything by name or item id, so it is easy to store, compare and send to a worker.
export interface BuildSpec {
  goal: Goal;
  subclass: Subclass;
  super: string;
  grenade: string;
  melee: string;
  classAbility: string;
  aspects: string[];
  fragments: string[];
  exotic: string;
  weapons: string[]; // weapon instance ids, kinetic / energy / power ("" = empty)
  armorLocks: Partial<Record<Slot, string>>; // armor the player picked; other slots are filled by the solver
}

export interface Settings {
  healthFloor: number;
  mw: MwMode;
}

export interface Ctx {
  inv: Inventory;
  defOf: (h: number) => ItemDef | undefined;
  defs: ItemDef[];
  characterId: string;
  light: number;
  pieces: Piece[];
  weapons: Weapon[]; // every weapon you own (any Power), for editing
  kit: Map<Subclass, Set<string>>;
  wornIds: Set<string>;
}

export function makeCtx(inv: Inventory, defOf: (h: number) => ItemDef | undefined, defs: ItemDef[], characterId: string): Ctx {
  const ch = inv.characters.find(c => c.id === characterId)!;
  return {
    inv, defOf, defs, characterId, light: ch.light,
    pieces: inv.items.map(i => readPiece(i, defOf)).filter((p): p is Piece => !!p),
    weapons: ownedWeapons(inv, defOf, 0),
    kit: availableKit(inv, defOf, characterId),
    wornIds: new Set(inv.items.filter(i => i.owner === characterId && i.equipped).map(i => i.id)),
  };
}

// Stats are part of the score: points up to 100 (ability speed) and past 100 (each stat's bonus effect).
export function statScore(st: Stats): number {
  let t = 0;
  for (const v of Object.values(st)) t += 0.2 * Math.min(v, 100) + 0.1 * Math.max(0, Math.min(v, 200) - 100);
  return t;
}

export interface BuildView {
  spec: BuildSpec;
  loopScore: number;
  statScore: number;
  parts: K[]; // subclass picks + exotic, in a fixed order
  weapons: (Weapon | undefined)[];
  loops: LoopReport;
  score: number;
  bonus: Stats;
  fragmentSlots: number;
  armor?: Solution;
  stats: Stats;
  issues: string[]; // plain-words problems to fix (missing piece, too many fragments...)
}

const k = (n: string) => byName.get(n);

export function fragmentSlots(aspects: string[], sub: Subclass): number {
  return Math.min(MAX_FRAGMENTS[sub], aspects.reduce((t, a) => t + (k(a)?.slots ?? 2), 0));
}

export function evaluate(spec: BuildSpec, ctx: Ctx, settings: Settings): BuildView {
  const issues: string[] = [];
  const need = (n: string, what: string) => { const x = k(n); if (!x) issues.push(`Pick a ${what}.`); return x; };
  const sup = need(spec.super, "super"), gr = need(spec.grenade, "grenade"), me = need(spec.melee, "melee"), ca = need(spec.classAbility, "class ability");
  const aspects = spec.aspects.map(k).filter((x): x is K => !!x);
  const slots = fragmentSlots(spec.aspects, spec.subclass);
  let fragments = spec.fragments.map(k).filter((x): x is K => !!x);
  if (fragments.length > slots) { issues.push(`Your aspects open ${slots} fragment slots; only the first ${slots} fragments count.`); fragments = fragments.slice(0, slots); }
  const exotic = k(spec.exotic);
  const weapons = spec.weapons.map(id => ctx.weapons.find(w => w.item.id === id));
  const core = { super: sup!, grenade: gr!, melee: me!, classAbility: ca!, aspects, fragments, exotic: exotic! };
  const parts = [sup, gr, me, ca, ...aspects, ...fragments, exotic].filter((x): x is K => !!x);
  const loops = scoreLoops([...parts.map(x => ({ k: x })), ...weaponParts(weapons.filter((w): w is Weapon => !!w))], spec.goal);
  const bonus = fragmentBonus(fragments, ctx.defs);

  let armor: Solution | undefined;
  if (exotic && sup && gr && me && ca) {
    const plan = planFor({ ...core, weapons: weapons.filter((w): w is Weapon => !!w) } as Pick<Build, "super" | "grenade" | "melee" | "classAbility" | "aspects" | "fragments" | "exotic" | "weapons">, spec.goal, settings.healthFloor);
    armor = solve(ctx.pieces, {
      cls: "Hunter", exotic: exotic.name, plan, bonus, mw: settings.mw, wornIds: ctx.wornIds,
      locks: spec.armorLocks, minPower: ctx.light - 60, top: 1,
    })[0];
    if (!armor) issues.push(`No armor fits: you don't own ${exotic.name}, or a locked piece conflicts.`);
  }
  void corePartsOf;
  const stats = armor?.stats ?? { health: 0, melee: 0, grenade: 0, super: 0, class: 0, weapons: 0 };
  return { spec, parts, weapons, loops, loopScore: loops.score, statScore: statScore(stats), score: loops.score + statScore(stats), bonus, fragmentSlots: slots, armor, stats, issues };
}

// What you're wearing right now, read from your equipped subclass, exotic and weapons.
export function currentSpec(ctx: Ctx, goal: Goal): BuildSpec | null {
  const worn = ctx.inv.items.filter(i => i.owner === ctx.characterId && i.equipped);
  const sub = worn.find(i => i.kind === "subclass");
  if (!sub) return null;
  const names = sub.plugs.map(h => ctx.defOf(h)?.name).filter(Boolean) as string[];
  const of = (kind: K["kind"]) => names.map(k).filter((x): x is K => !!x && x.kind === kind);
  const exo = worn.find(i => i.kind === "armor" && i.exotic);
  const locks: Partial<Record<Slot, string>> = {};
  for (const a of worn.filter(i => i.kind === "armor")) if (a.slot) locks[a.slot] = a.id;
  const wslot = (s: string) => worn.find(i => i.kind === "weapon" && i.slot === s)?.id ?? "";
  return {
    goal, subclass: sub.name as Subclass,
    super: of("super")[0]?.name ?? "", grenade: of("grenade")[0]?.name ?? "", melee: of("melee")[0]?.name ?? "",
    classAbility: of("classAbility")[0]?.name ?? "",
    aspects: of("aspect").map(x => x.name), fragments: of("fragment").map(x => x.name),
    exotic: exo?.name ?? "", weapons: [wslot("kinetic"), wslot("energy"), wslot("power")], armorLocks: locks,
  };
}

// "Now" uses the game's own numbers: your character screen stats and the mods you actually slotted.
export function evaluateNow(ctx: Ctx, goal: Goal, settings: Settings): BuildView | null {
  const spec = currentSpec(ctx, goal);
  if (!spec) return null;
  const v = evaluate(spec, ctx, { ...settings, mw: "asIs" });
  const ch = ctx.inv.characters.find(c => c.id === ctx.characterId)!;
  v.stats = { ...ch.stats };
  v.statScore = statScore(v.stats);
  v.score = v.loopScore + v.statScore;
  if (v.armor) v.armor = { ...v.armor, stats: { ...ch.stats } };
  v.issues = v.issues.filter(i => !i.startsWith("No armor"));
  return v;
}

// "Your build, tuned": keep your subclass, abilities, aspects, exotic and weapons; swap fragments only when the
// loop gain beats the stat cost, and let the solver pick armor and mods (it keeps what you wear when that's best).
export function tuneCurrent(ctx: Ctx, goal: Goal): BuildSpec | null {
  const spec = currentSpec(ctx, goal);
  if (!spec) return null;
  const base = { ...spec, armorLocks: {} };
  const sub = spec.subclass;
  const options = [...(ctx.kit.get(sub) ?? [])].map(k).filter((x): x is K => !!x && x.kind === "fragment" && !!x.subs?.includes(sub));
  const slots = fragmentSlots(spec.aspects, sub);
  const quick = (frags: string[]) => {
    const fr = frags.map(k).filter((x): x is K => !!x);
    const parts = [spec.super, spec.grenade, spec.melee, spec.classAbility, ...spec.aspects, spec.exotic].map(k).filter((x): x is K => !!x);
    const ws = spec.weapons.map(id => ctx.weapons.find(w => w.item.id === id)).filter((w): w is Weapon => !!w);
    return scoreLoops([...[...parts, ...fr].map(x => ({ k: x })), ...weaponParts(ws)], goal).score + 0.2 * statTotal(fragmentBonus(fr, ctx.defs));
  };
  let frags = spec.fragments.slice(0, slots);
  for (let round = 0; round < 8; round++) {
    let best = frags, bestScore = quick(frags);
    const tries: string[][] = [];
    for (const o of options) {
      if (frags.includes(o.name)) continue;
      if (frags.length < slots) tries.push([...frags, o.name]);
      for (let i = 0; i < frags.length; i++) { const t = [...frags]; t[i] = o.name; tries.push(t); }
    }
    for (const t of tries) { const sc = quick(t); if (sc > bestScore + 0.01) { bestScore = sc; best = t; } }
    if (best === frags) break;
    frags = best;
  }
  return { ...base, fragments: frags };
}

export function specFromBuild(b: Build): BuildSpec {
  return {
    goal: b.goal, subclass: b.subclass, super: b.super.name, grenade: b.grenade.name, melee: b.melee.name,
    classAbility: b.classAbility.name, aspects: b.aspects.map(a => a.name), fragments: b.fragments.map(f => f.name),
    exotic: b.exotic.name, weapons: ["kinetic", "energy", "power"].map(s => b.weapons.find(w => w.item.slot === s)?.item.id ?? ""), armorLocks: {},
  };
}

export const summary = (v: BuildView) => ({ over100: count100(v.stats), low: lowest(v.stats) });
export { ARMOR_SLOTS };
