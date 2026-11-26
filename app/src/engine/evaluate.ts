import { dpsPoints } from "./damage";
import { ARMOR_SLOTS, STAT_LABEL, STAT_ORDER, type Slot } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import type { Inventory, Stats } from "../model/inventory";
import { byName, MAX_FRAGMENTS, type ClassName, type K, type Subclass } from "../knowledge/hunter";
import { perkKnowledge, type ArtifactPerk } from "../knowledge/artifact";
import { artifactsOf, bestArtifact, fitArtifact, perkByName, type ArtifactChoice } from "./artifact";
import { readPiece, type MwMode, type Piece } from "./armor";
import { damageFor, loopGuns, availableKit, corePartsOf, subMarker, type StatTargets, fragmentBonus, ownedWeapons, planFor, withPerks, statTotal, weaponParts, type Build, type StatStyle, type Weapon } from "./builds";
import { scoreLoops, type Goal, type LoopReport } from "./loops";
import { count100, lowest, planValue, solve, statValue, type Solution, type StatPlan } from "./solve";
import type { Part } from "./loops";
import { CATALOG_OWNER, standInSource } from "./catalog";
import { ownedMods, planArmorMods, type PieceMods } from "./mods";

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
  weaponPerks?: Record<string, string[]>; // weapon id -> the perk picked in each column (free to switch in game)
  armorLocks: Partial<Record<Slot, string>>; // armor the player picked; other slots are filled by the solver
  artifact?: string; // artifact name ("" or missing = keep whatever is equipped)
  artifactPerks?: string[];
}

export interface Settings {
  targets: StatTargets; // per-stat minimums; 100 = "Keep at 100+"
  tune?: boolean; // let Steeped change armor tuning plugs
  mw: MwMode;
  style: StatStyle; // "peaks" = most stats at 100+ (nothing under the floor), "even" = spread evenly
}

export interface Ctx {
  inv: Inventory;
  defOf: (h: number) => ItemDef | undefined;
  defs: ItemDef[];
  characterId: string;
  cls: ClassName;
  light: number;
  pieces: Piece[];
  weapons: Weapon[]; // every weapon you own (any Power), for editing
  kit: Map<Subclass, Set<string>>;
  wornIds: Set<string>;
  ownedMods: Map<number, Set<number>>;
  artifacts: ArtifactChoice[]; // all seven, with the perks each one can take
  perks: Map<string, ArtifactPerk>;
  sets: Map<number, SetInfo>; // armor sets you own pieces of, with their bonuses as rules
}
// An armor set: which slots you own pieces for, and its 2- and 4-piece bonuses as rules the loops can score.
export interface SetInfo { hash: number; name: string; slots: Set<Slot>; perks: { count: number; k: ArtifactPerk }[] }
function setsOf(pieces: Piece[], defOf: (h: number) => ItemDef | undefined, cls: ClassName): Map<number, SetInfo> {
  const out = new Map<number, SetInfo>();
  for (const p of pieces) {
    if (!p.set || p.item.cls !== cls) continue;
    let s = out.get(p.set);
    if (!s) {
      const def = defOf(p.item.hash)?.set;
      if (!def) continue;
      s = { hash: p.set, name: def.name, slots: new Set(), perks: def.perks.map(x => ({ count: x.count, k: perkKnowledge(x.hash, x.name, x.desc, "set") })) };
      out.set(p.set, s);
    }
    s.slots.add(p.slot);
  }
  return out;
}
// The set bonuses a chosen set of armor turns on.
export function activeSetPerks(armor: Solution | undefined, ctx: Ctx): ArtifactPerk[] {
  if (!armor) return [];
  const n = new Map<number, number>();
  for (const p of Object.values(armor.pieces)) if (p.set) n.set(p.set, (n.get(p.set) ?? 0) + 1);
  const out: ArtifactPerk[] = [];
  for (const [h, c] of n) for (const x of ctx.sets.get(h)?.perks ?? []) if (c >= x.count) out.push(x.k);
  return out;
}

export function makeCtx(inv: Inventory, defOf: (h: number) => ItemDef | undefined, defs: ItemDef[], characterId: string): Ctx {
  const ch = inv.characters.find(c => c.id === characterId)!;
  const artifacts = artifactsOf(inv, defOf, characterId);
  const pieces = inv.items.map(i => readPiece(i, defOf)).filter((p): p is Piece => !!p);
  return {
    artifacts, perks: perkByName(artifacts),
    inv, defOf, defs, characterId, cls: ch.cls, light: ch.light,
    pieces, sets: setsOf(pieces, defOf, ch.cls),
    weapons: ownedWeapons(inv, defOf, ch.light),
    kit: availableKit(inv, defOf, characterId),
    wornIds: new Set(inv.items.filter(i => i.owner === characterId && i.equipped).map(i => i.id)),
    ownedMods: ownedMods(inv.items, defOf),
  };
}

// Stats are part of the score, valued exactly the way the armor solver values them for this build: the stats the
// build leans on count more, points under your floor (Health minimum) cost a lot, 70 to 100 counts half, and in
// "Most 100s" style reaching 100 earns a bonus. Without a plan (no armor) every point counts the same.
export const STAT_SCALE = 0.3;
export function statScore(st: Stats, plan?: StatPlan): number {
  // "Keep at 100+" is a must for the armor search, but in the rating a miss costs the normal amount, so a
  // build that falls short reads as a bit lower, not as zero.
  if (plan) return STAT_SCALE * planValue(st, Object.fromEntries(Object.entries(plan).map(([k, w]) => [k, { ...w, hard: false }])) as StatPlan);
  let t = 0;
  for (const v of Object.values(st)) t += 0.2 * Math.min(v, 100) + 0.1 * Math.max(0, Math.min(v, 200) - 100);
  return t;
}

export interface BuildView {
  plan?: StatPlan;
  ratingPlan?: StatPlan; // the plan the rating uses (targets left on Auto)
  coreParts: Part[]; // subclass picks, exotic and subclass marker
  perkParts: Part[]; // artifact perks
  setPerks: ArtifactPerk[]; // armor set bonuses the chosen armor turns on
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
  artifact?: ArtifactChoice;
  artifactPerks: ArtifactPerk[];
}

const k = (n: string) => byName.get(n);

export function fragmentSlots(aspects: string[], sub: Subclass): number {
  return Math.min(MAX_FRAGMENTS[sub], aspects.reduce((t, a) => t + (k(a)?.slotsBy?.[sub] ?? k(a)?.slots ?? 2), 0));
}

// Boss builds earn points for tested boss DPS on their special and heavy guns (Aegis's sheet), on top of
// the perk judgment in the loops. Guns the sheet never tested only get the judgment.
export const damagePoints = (ws: (Weapon | undefined)[], goal: Goal) => goal !== "bossDps" ? 0
  : ws.reduce((t, w) => { const d = w && w.ammo > 1 ? damageFor(w) : null; return t + (d ? dpsPoints(d, w!.ammo) : 0); }, 0);

export function evaluate(spec: BuildSpec, ctx: Ctx, settings: Settings): BuildView {
  const issues: string[] = [];
  const need = (n: string, what: string) => { const x = k(n); if (!x) issues.push(`Pick a ${what}.`); return x; };
  const sup = need(spec.super, "super"), gr = need(spec.grenade, "grenade"), me = need(spec.melee, "melee"), ca = need(spec.classAbility, "class ability");
  const aspects = spec.aspects.map(k).filter((x): x is K => !!x);
  const slots = fragmentSlots(spec.aspects, spec.subclass);
  let fragments = spec.fragments.map(k).filter((x): x is K => !!x);
  if (fragments.length > slots) { issues.push(`Your aspects open ${slots} fragment slots; only the first ${slots} fragments count.`); fragments = fragments.slice(0, slots); }
  const exotic = k(spec.exotic);
  const weapons = spec.weapons.map(id => weaponOf(ctx, spec, id));
  const core = { super: sup!, grenade: gr!, melee: me!, classAbility: ca!, aspects, fragments, exotic: exotic! };
  const parts = [sup, gr, me, ca, ...aspects, ...fragments, exotic].filter((x): x is K => !!x);
  const artifact = ctx.artifacts.find(a => a.name === spec.artifact) ?? ctx.artifacts.find(a => a.equipped);
  // Bungie switches artifacts off in Trials and Competitive, so their perks count for nothing there.
  const artifactPerks = spec.goal === "trials" ? [] : (spec.artifactPerks ?? []).map(n => ctx.perks.get(n)).filter((x): x is ArtifactPerk => !!x);
  const loopParts = [...parts.map(x => ({ k: x })), subMarker(spec.subclass), ...weaponParts(loopGuns(weapons.filter((w): w is Weapon => !!w), spec.goal)), ...artifactPerks.map(k => ({ k }))];
  let loops = scoreLoops(loopParts, spec.goal);
  const loopsBase = loops;
  const pushSurvives = () => { for (const w of loops.survives) issues.push(`Not solo-ready: ${w}. ${/damage you take/.test(w) ? "Add damage resistance (Frost Armor, overshield, invisibility, Woven Mail)." : "Add a healing source (Restoration, Devour, Cure, or a Harvest aspect that heals on shard pickup)."}`); };
  const bonus = fragmentBonus(fragments, ctx.defs);

  let armor: Solution | undefined, plan: StatPlan | undefined, ratingPlan: StatPlan | undefined;
  if (exotic && sup && gr && me && ca) {
    const shape = { ...core, weapons: weapons.filter((w): w is Weapon => !!w) } as Pick<Build, "super" | "grenade" | "melee" | "classAbility" | "aspects" | "fragments" | "exotic" | "weapons">;
    plan = planFor(shape, spec.goal, settings.targets, settings.style);
    // Your stat targets steer the armor search, but the rating always uses Steeped's own stat plan, so the same
    // build gets the same rating on Home and in the Builder whatever targets you set. Missed targets show as issues.
    ratingPlan = planFor(shape, spec.goal, {}, settings.style);
    const opts = {
      cls: ctx.cls, exotic: exotic.name, plan, bonus, mw: settings.mw, wornIds: ctx.wornIds,
      locks: spec.armorLocks, minPower: ctx.light - 60, top: 1, tune: settings.tune,
    };
    armor = solve(ctx.pieces, opts)[0];
    // Armor sets: try each set you own enough pieces of whose bonus would add to this build, and keep it when
    // the bonus is worth more than the stats you give up for it.
    if (armor && ctx.sets.size) {
      const total = (a: Solution) => scoreLoops([...loopParts, ...activeSetPerks(a, ctx).map(k => ({ k }))], spec.goal).score + statScore(a.stats, ratingPlan);
      let bestTotal = total(armor);
      const exoSlot = ctx.pieces.find(p => p.exotic && p.item.name === exotic.name)?.slot;
      for (const st of ctx.sets.values()) {
        const free = [...st.slots].filter(sl => sl !== exoSlot && !spec.armorLocks?.[sl]).length;
        for (const count of [2, 4]) {
          if (free < count || !st.perks.some(x => x.count === count)) continue;
          const gain = scoreLoops([...loopParts, ...st.perks.filter(x => x.count <= count).map(x => ({ k: x.k }))], spec.goal).score - loopsBase.score;
          if (gain <= 0.3) continue; // the bonus does nothing for this build
          const a = solve(ctx.pieces, { ...opts, set: { hash: st.hash, count } })[0];
          if (a && total(a) > bestTotal + 0.05) { armor = a; bestTotal = total(a); }
        }
      }
    }
    if (!armor) issues.push(`No armor fits: you don't own ${exotic.name}, or a locked piece conflicts.`);
    else for (const k of STAT_ORDER) {
      const t = settings.targets[k];
      if (t && armor.stats[k] < t) issues.push(`${STAT_LABEL[k]} can't reach ${t >= 100 ? "100" : t} with this exotic and your armor: the most it gets here is ${armor.stats[k]}.`);
    }
  }
  void corePartsOf;
  const setPerks = activeSetPerks(armor, ctx);
  if (setPerks.length) loops = scoreLoops([...loopParts, ...setPerks.map(k => ({ k }))], spec.goal);
  pushSurvives();
  const stats = armor?.stats ?? { health: 0, melee: 0, grenade: 0, super: 0, class: 0, weapons: 0 };
  const coreParts = [...parts.map(x => ({ k: x })), subMarker(spec.subclass)], perkParts = artifactPerks.map(k => ({ k }));
  return { plan, coreParts, perkParts, setPerks, artifact, artifactPerks, spec, parts, weapons, loops, loopScore: loops.score, statScore: statScore(stats, ratingPlan), score: loops.score + statScore(stats, ratingPlan) + damagePoints(weapons, spec.goal), ratingPlan, bonus, fragmentSlots: slots, armor, stats, issues };
}

// Where the points come from. A piece is worth what the build would lose without it, so pieces that only work
// together each show the full value of the pairing (the numbers overlap on purpose).
export interface PiecePoints { name: string; group: "Weapons" | "Exotic" | "Subclass" | "Artifact" | "Armor set" | "Stats"; points: number; detail?: string }
export function pointsByPiece(v: BuildView): PiecePoints[] {
  const goal = v.spec.goal, ws = v.weapons.filter((w): w is Weapon => !!w);
  const score = (core: Part[], weps: Weapon[], perks: Part[]) => scoreLoops([...core, ...weaponParts(weps), ...perks], goal).score;
  const base = score(v.coreParts, ws, v.perkParts);
  const out: PiecePoints[] = [];
  for (const w of ws) out.push({ name: w.item.name, group: "Weapons", points: base - score(v.coreParts, ws.filter(x => x !== w), v.perkParts), detail: w.ks.filter(x => x.name !== w.item.name).map(x => x.name).join(", ") || undefined });
  for (const p of v.coreParts) {
    if (p.k.name.startsWith("__")) continue;
    out.push({ name: p.k.name, group: p.k.kind === "exotic" ? "Exotic" : "Subclass", points: base - score(v.coreParts.filter(x => x !== p), ws, v.perkParts) });
  }
  for (const p of v.perkParts) out.push({ name: p.k.name, group: "Artifact", points: base - score(v.coreParts, ws, v.perkParts.filter(x => x !== p)) });
  const setParts = (v.setPerks ?? []).map(k => ({ k }));
  for (const p of setParts) out.push({ name: p.k.name, group: "Armor set", points: score([...v.coreParts, ...setParts], ws, v.perkParts) - score([...v.coreParts, ...setParts.filter(x => x !== p)], ws, v.perkParts) });
  if (v.plan) for (const k of STAT_ORDER) {
    const w = v.plan[k];
    out.push({ name: STAT_LABEL[k], group: "Stats", points: STAT_SCALE * statValue(v.stats[k], w), detail: `${v.stats[k]}${v.stats[k] < w.floor ? `, under your minimum of ${w.floor}` : ""}` });
  }
  return out;
}

// A spec's weapon, with the perks it picked in each column.
export function weaponOf(ctx: Ctx, spec: Pick<BuildSpec, "weaponPerks">, id: string): Weapon | undefined {
  const w = ctx.weapons.find(x => x.item.id === id);
  const names = w && spec.weaponPerks?.[id];
  if (!w || !names) return w;
  return withPerks(w, w.cols.map((c, i) => Math.max(0, c.options.findIndex(o => o.name === names[i]))));
}
export const perkNames = (w: Weapon) => w.ks.slice(w.base.length).map(k => k.name);

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
  const art = ctx.artifacts.find(a => a.equipped);
  const wslot = (s: string) => worn.find(i => i.kind === "weapon" && i.slot === s)?.id ?? "";
  return {
    goal, subclass: sub.name as Subclass,
    super: of("super")[0]?.name ?? "", grenade: of("grenade")[0]?.name ?? "", melee: of("melee")[0]?.name ?? "",
    classAbility: of("classAbility")[0]?.name ?? "",
    aspects: of("aspect").map(x => x.name), fragments: of("fragment").map(x => x.name),
    exotic: exo?.name ?? "", weapons: [wslot("kinetic"), wslot("energy"), wslot("power")], armorLocks: locks,
    artifact: art?.name ?? "", artifactPerks: art ? art.sockets.map(x => x.current?.name).filter((n): n is string => !!n) : [],
  };
}

// "Now" uses the game's own numbers: your character screen stats and the mods you actually slotted.
export function evaluateNow(ctx: Ctx, goal: Goal, settings: Settings, given?: BuildSpec): BuildView | null {
  const spec = given ?? currentSpec(ctx, goal);
  if (!spec) return null;
  const v = evaluate(spec, ctx, { ...settings, mw: "asIs" });
  const ch = ctx.inv.characters.find(c => c.id === ctx.characterId)!;
  v.stats = { ...ch.stats };
  v.statScore = statScore(v.stats, v.ratingPlan);
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
    const ws = spec.weapons.map(id => weaponOf(ctx, spec, id)).filter((w): w is Weapon => !!w);
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
  // The best of all seven artifacts for this build, with its perks picked for it.
  const parts = [spec.super, spec.grenade, spec.melee, spec.classAbility, ...spec.aspects, ...frags, spec.exotic].map(k).filter((x): x is K => !!x).map(x => ({ k: x }));
  const ws = spec.weapons.map(id => weaponOf(ctx, spec, id)).filter((w): w is Weapon => !!w);
  const fit = goal === "trials" ? undefined : bestArtifact([...parts, subMarker(sub), ...weaponParts(ws)], goal, ctx.artifacts);
  if (!fit) return { ...base, fragments: frags };
  return { ...base, fragments: frags, artifact: fit.artifact.name, artifactPerks: fit.perks.map(p => p.perk.name) };
}

// "Tune my artifact": keep everything you wear and try all seven artifacts, each with the perks that add the most
// to this exact build (your subclass, exotic, weapons and armor set bonuses). Nothing else changes.
export interface ArtifactTune {
  now: BuildView; // what you wear, with the perks you have in
  best: BuildView; // same build, best artifact and perks
  gain: number; // score points (same scale as BuildView.score)
  options: { name: string; equipped: boolean; score: number; perks: string[] }[]; // all seven, best first
  add: string[]; remove: string[]; // perk changes from what you have now
}
export function tuneArtifactNow(ctx: Ctx, goal: Goal, settings: Settings): ArtifactTune | null {
  const now = evaluateNow(ctx, goal, settings);
  if (!now || goal === "trials" || !ctx.artifacts.length) return null;
  const base = [...now.coreParts, ...weaponParts(now.weapons.filter((w): w is Weapon => !!w)), ...now.setPerks.map(k => ({ k }))];
  const options = ctx.artifacts.map(a => {
    const perks = fitArtifact(base, goal, a).perks.map(p => p.perk.name);
    const v = evaluateNow(ctx, goal, settings, { ...now.spec, artifact: a.name, artifactPerks: perks })!;
    return { name: a.name, equipped: a.equipped, score: v.score, perks, v };
  }).sort((x, y) => y.score - x.score || Number(y.equipped) - Number(x.equipped));
  // Only move off what you have for a real gain, so Steeped never asks you to reshuffle for nothing.
  const top = options[0].score > now.score + 0.5 ? options[0].v : now;
  const had = now.spec.artifactPerks ?? [], want = top.spec.artifactPerks ?? [];
  return {
    now, best: top, gain: top.score - now.score,
    options: options.map(({ v, ...o }) => { void v; return o; }),
    add: want.filter(n => !had.includes(n)), remove: top.spec.artifact === now.spec.artifact ? had.filter(n => !want.includes(n)) : had,
  };
}

// Switch a build to another artifact (or re-pick perks on the same one), choosing its best perks for this build.
export function refitArtifact(spec: BuildSpec, ctx: Ctx, name: string): Partial<BuildSpec> {
  const art = ctx.artifacts.find(a => a.name === name);
  if (!art) return { artifact: name, artifactPerks: [] };
  const parts = [spec.super, spec.grenade, spec.melee, spec.classAbility, ...spec.aspects, ...spec.fragments, spec.exotic].map(k).filter((x): x is K => !!x).map(x => ({ k: x }));
  const ws = spec.weapons.map(id => weaponOf(ctx, spec, id)).filter((w): w is Weapon => !!w);
  return { artifact: name, artifactPerks: fitArtifact([...parts, subMarker(spec.subclass), ...weaponParts(ws)], spec.goal, art).perks.map(p => p.perk.name) };
}

export function specFromBuild(b: Build): BuildSpec {
  return {
    goal: b.goal, subclass: b.subclass, super: b.super.name, grenade: b.grenade.name, melee: b.melee.name,
    classAbility: b.classAbility.name, aspects: b.aspects.map(a => a.name), fragments: b.fragments.map(f => f.name),
    exotic: b.exotic.name, weapons: ["kinetic", "energy", "power"].map(s => b.weapons.find(w => w.item.slot === s)?.item.id ?? ""), armorLocks: {},
    weaponPerks: Object.fromEntries(b.weapons.map(w => [w.item.id, perkNames(w)])),
    artifact: b.artifact?.artifact.name ?? "", artifactPerks: b.artifact?.perks.map(p => p.perk.name) ?? [],
  };
}

export const summary = (v: BuildView) => ({ over100: count100(v.stats), low: lowest(v.stats) });
export { ARMOR_SLOTS };

// ---------- Breakdown: where each stat comes from, which mod goes on which piece, and what to change in game ----------
import { STAT_ORDER as ORDER, type StatKey } from "../bungie/config";
import { pieceStats } from "./armor";
import { zeroStats } from "../model/inventory";

const modOf = (p: Piece): { stat: StatKey; size: number } | null => {
  for (const k of ORDER) if (p.mod[k]) return { stat: k, size: p.mod[k] };
  return null;
};

// Which +10 mod goes on which piece: a piece keeps its current mod when the build still wants that stat.
export function modPlan(v: BuildView): Partial<Record<Slot, { stat: StatKey; was: { stat: StatKey; size: number } | null }>> {
  const out: Partial<Record<Slot, { stat: StatKey; was: { stat: StatKey; size: number } | null }>> = {};
  if (!v.armor) return out;
  const left = [...v.armor.mods];
  const slots = ARMOR_SLOTS.filter(s => v.armor!.pieces[s]);
  for (const s of slots) {
    const cur = modOf(v.armor.pieces[s]);
    const i = cur && cur.size === 10 ? left.indexOf(cur.stat) : -1;
    if (i >= 0) { out[s] = { stat: cur!.stat, was: cur }; left.splice(i, 1); }
  }
  for (const s of slots) if (!out[s] && left.length) out[s] = { stat: left.shift()!, was: modOf(v.armor.pieces[s]) };
  return out;
}

export interface Breakdown { armor: Stats; mods: Stats; fragments: Stats; other: Stats; total: Stats }
export function breakdown(v: BuildView, settings: Settings, isNow: boolean): Breakdown {
  const armor = zeroStats(), mods = zeroStats(), other = zeroStats();
  for (const p of Object.values(v.armor?.pieces ?? {})) {
    const st = pieceStats(p, isNow ? "asIs" : settings.mw, isNow ? "current" : v.armor?.tuning?.[p.slot] ?? "current");
    for (const k of ORDER) { armor[k] += st[k]; if (isNow) mods[k] += p.mod[k]; }
  }
  if (!isNow) for (const m of v.armor?.mods ?? []) mods[m] += 10;
  for (const k of ORDER) other[k] = v.stats[k] - armor[k] - mods[k] - v.bonus[k];
  return { armor, mods, fragments: v.bonus, other, total: v.stats };
}

export interface Step { what: string; detail?: string }
const LBL: Record<StatKey, string> = { health: "Health", melee: "Melee", grenade: "Grenade", super: "Super", class: "Class", weapons: "Weapons" };
const where = (i: { id?: string; owner: string; equipped: boolean }, cid: string) => {
  if (i.owner === CATALOG_OWNER) {
    const s = standInSource(i.id ?? "");
    return s?.acquired ? "not on you: pull it from Collections" : `you don't own it yet${s?.source ? `: ${s.source}` : ""}`;
  }
  return i.owner === cid ? (i.equipped ? "worn" : "on your character") : i.owner === "vault" ? "in your vault" : "on another character";
};

export function stepsFrom(now: BuildView, v: BuildView, ctx: Ctx): Step[] {
  const steps: Step[] = [];
  const a = now.spec, b = v.spec;
  if (a.subclass !== b.subclass) steps.push({ what: `Switch subclass to ${b.subclass}` });
  for (const [label, key] of [["super", "super"], ["grenade", "grenade"], ["melee", "melee"], ["class ability", "classAbility"]] as const)
    if (a.subclass !== b.subclass || a[key] !== b[key]) steps.push({ what: `Set your ${label} to ${b[key]}` });
  const asOut = a.aspects.filter(x => !b.aspects.includes(x)), asIn = b.aspects.filter(x => !a.aspects.includes(x));
  asIn.forEach((x, i) => steps.push({ what: `Aspect: ${asOut[i] ? `replace ${asOut[i]} with ` : "add "}${x}` }));
  const frOut = a.subclass === b.subclass ? a.fragments.filter(x => !b.fragments.includes(x)) : [];
  const frIn = a.subclass === b.subclass ? b.fragments.filter(x => !a.fragments.includes(x)) : b.fragments;
  if (frOut.length || frIn.length) steps.push({ what: `Fragments: ${[...frOut.map(x => `remove ${x}`), ...frIn.map(x => `add ${x}`)].join(", ")}` });
  const slotName = ["Kinetic", "Energy", "Heavy"];
  b.weapons.forEach((id, i) => {
    if (id && id !== a.weapons[i]) {
      const w = ctx.weapons.find(x => x.item.id === id);
      if (w) steps.push({ what: `${slotName[i]}: equip ${w.item.name}`, detail: `${w.element}, ${w.tier ? `Tier ${w.tier}, ` : ""}Power ${w.item.power}, ${where(w.item, ctx.characterId)}` });
    }
    const w = id ? weaponOf(ctx, b, id) : undefined;
    if (w?.infuse) steps.push({ what: `Infuse ${w.item.name} first`, detail: `It's Power ${w.item.power}. Equipped as-is it would pull your Power down, so infuse it up to your level.` });
    if (w) w.cols.forEach((c, j) => {
      const pick = w.ks[w.base.length + j];
      if (pick && pick.name !== c.options[0].name) steps.push({ what: `${w.item.name}: switch ${c.options[0].name} to ${pick.name}`, detail: "Free to swap in the weapon's perk column" });
    });
  });
  for (const s of ARMOR_SLOTS) {
    const p = v.armor?.pieces[s], q = now.armor?.pieces[s];
    if (p && p.item.id !== q?.item.id) steps.push({ what: `${s === "class" ? "Class item" : s[0].toUpperCase() + s.slice(1)}: equip ${p.item.name}`, detail: `Tier ${p.tier} ${p.archetype}, ${where(p.item, ctx.characterId)}` });
  }
  if (b.artifact && b.artifact !== a.artifact) steps.push({ what: `Artifact: switch to ${b.artifact}`, detail: "Character screen, artifact slot" });
  const pOut = b.artifact === a.artifact ? (a.artifactPerks ?? []).filter(x => !(b.artifactPerks ?? []).includes(x)) : [];
  const pIn = b.artifact === a.artifact ? (b.artifactPerks ?? []).filter(x => !(a.artifactPerks ?? []).includes(x)) : (b.artifactPerks ?? []);
  if (pIn.length) steps.push({ what: `Artifact perks: ${[...pOut.map(x => `remove ${x}`), ...pIn.map(x => `add ${x}`)].join(", ")}` });
  for (const s of ARMOR_SLOTS) {
    const t = v.armor?.tuning?.[s], p = v.armor?.pieces[s];
    if (t && p) steps.push({ what: `${p.item.name}: set tuning to ${t.name}`, detail: `replaces ${ctx.defOf(p.item.plugs[p.tuneSocket])?.name ?? "current tuning"}` });
  }
  const plan = modPlan(v);
  for (const s of ARMOR_SLOTS) {
    const m = plan[s], p = v.armor?.pieces[s];
    if (!m || !p) continue;
    if (m.was && m.was.stat === m.stat && m.was.size === 10) continue;
    steps.push({ what: `${p.item.name}: put in a +10 ${LBL[m.stat]} mod`, detail: m.was ? `replaces ${m.was.size === 5 ? "minor " : ""}${LBL[m.was.stat]}` : "empty slot" });
  }
  return steps;
}

// The full armor mod plan for a build: the +10 stat mod plus every other slot, per piece.
export function fullModPlan(v: BuildView, ctx: Ctx): PieceMods[] {
  const sm: Partial<Record<Slot, StatKey>> = {};
  for (const [k, x] of Object.entries(modPlan(v))) if (x) sm[k as Slot] = x.stat;
  return planArmorMods(v, ctx.defOf, sm, ctx.ownedMods);
}

// Non-stat mods currently socketed on a piece.
export function currentSlotMods(p: Piece, ctx: Ctx): string[] {
  return p.item.plugs.map(h => ctx.defOf(h)).filter(d => d && d.plugCat.startsWith("enhancements.v2_") && d.plugCat !== "enhancements.v2_general" && d.name !== "Empty Mod Socket").map(d => d!.name);
}

export function modSteps(v: BuildView, ctx: Ctx): Step[] {
  const out: Step[] = [];
  for (const pm of fullModPlan(v, ctx)) {
    const cur = currentSlotMods(pm.piece, ctx);
    const want = pm.mods.map(m => m.name);
    const add = want.filter(n => !cur.includes(n)), remove = cur.filter(n => !want.includes(n));
    if (add.length) out.push({ what: `${pm.piece.item.name}: add ${add.join(", ")}`, detail: remove.length ? `remove ${remove.join(", ")}` : undefined });
  }
  return out;
}
