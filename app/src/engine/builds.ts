import { STAT_HASH, STAT_ORDER, type StatKey } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import { zeroStats, type Inventory, type Item, type Stats } from "../model/inventory";
import { byName, ELEMENT, HUNTER, MAX_FRAGMENTS, SUBCLASSES, WEAPON_TYPE, type K, type Subclass } from "../knowledge/hunter";
import { readPiece, type Piece } from "./armor";
import { isPvp, scoreLoops, weightOf, statLean, type Goal, type LoopReport, type Part } from "./loops";
import { solve, type Solution, type StatPlan } from "./solve";
import { artifactsOf, bestArtifact, type ArtifactFit } from "./artifact";
import { perkKnowledge, type ArtifactPerk } from "../knowledge/artifact";
import { DUEL_SLOT, PVP_PAST_100, WEAPON_STAT, duelRating, type WeaponStats } from "../knowledge/pvp";

export interface Weapon {
  item: Item;
  ks: K[]; // knowledge that applies: the weapon itself and its perks
  element: string;
  ammo: number; // 1 primary, 2 special, 3 heavy
  type: string; // Auto Rifle, Hand Cannon...
  rated: boolean; // Steeped knows this weapon or one of its perks (otherwise it only knows the frame)
  duel?: number; // 0-10: how well its own Bungie stats suit PvP duels for its type (Steeped's weights)
  wstats: WeaponStats;
  tier: number; // gear tier 1-5 (0 for exotics and old gear)
  infuse: boolean; // below your Power: needs infusing before it's worth equipping
  // Perk columns you can switch between for free (Tier 3+ drops with 2-3 per column). cols[i][0] is what's slotted.
  cols: { socket: number; options: ArtifactPerk[] }[];
  base: K[]; // the weapon's own knowledge and type (not its column perks)
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
  artifact?: ArtifactFit;
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

export function ownedWeapons(inv: Inventory, defOf: DefOf, power = 0): Weapon[] {
  // Every weapon counts, whatever its Power: one below yours just needs infusing first.
  return inv.items
    .filter(i => i.kind === "weapon")
    .map(item => {
      const base: K[] = [];
      const own = byName.get(item.name);
      if (own && own.kind === "weapon") base.push(own);
      const cols: Weapon["cols"] = [];
      item.plugs.forEach((h, socket) => {
        const d = defOf(h);
        if (!d?.name) return;
        const trait = d.plugCat === "frames" || d.plugCat === "origins" || (item.exotic && d.plugCat === "intrinsics" && !own);
        if (!trait) { const k = byName.get(d.name); if (k && k.kind === "weapon" && !base.includes(k)) base.push(k); return; }
        const hashes = [h, ...(item.reusable[socket] ?? []).filter(x => x !== h)];
        const options = hashes.map(x => defOf(x)).filter((x): x is ItemDef => !!x?.name)
          .map(x => perkKnowledge(x.hash, x.name, x.desc ?? "", "weapon"));
        cols.push({ socket, options });
      });
      const typeName = defOf(item.hash)?.type ?? "";
      const type = WEAPON_TYPE[typeName];
      if (type) base.push(type);
      const ks = [...base, ...cols.map(c => c.options[0])];
      const rated = base.some(k => k !== type) || cols.some(c => c.options[0].read === "checked");
      const wstats: WeaponStats = Object.fromEntries(Object.entries(WEAPON_STAT).map(([k, h]) => [k, item.wstats?.[h] ?? 0])) as WeaponStats;
      return { item, ks, base, cols, element: item.damage || "Kinetic", ammo: defOf(item.hash)?.ammo ?? 1, type: typeName, rated, wstats,
        duel: duelRating(typeName, wstats), tier: item.gearTier ?? 0, infuse: power > 0 && item.power < power - 10 };
    });
}

// The same weapon with other perks picked in its columns (free to switch in game).
export const withPerks = (w: Weapon, picks: number[]): Weapon => ({ ...w, ks: [...w.base, ...w.cols.map((c, i) => c.options[picks[i]] ?? c.options[0])] });

// Your equipped artifact's perks, matched to what Steeped knows. Unknown perks are returned by name so the page can show them.
export function artifactKit(inv: Inventory, defOf: DefOf, characterId: string): { name: string; known: K[]; unknown: string[] } {
  const a = inv.artifacts?.[characterId];
  if (!a) return { name: "", known: [], unknown: [] };
  const names = a.perks.map(h => defOf(h)?.name ?? "").filter(n => n && !/^Empty/i.test(n));
  const known = names.map(n => byName.get(n)).filter((k): k is K => !!k && k.kind === "artifact");
  return { name: a.name, known, unknown: names.filter(n => !known.some(k => k.name === n)) };
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

// Each weapon also carries its element and frame as markers, so perks like Volatile Flow ("needs a Void weapon") can check.
const marker = (name: string): K => ({ name, kind: "weapon", makes: [], uses: [], says: "" });
// In PvP goals each gun also brings its duel rating, weighted by slot (primary counts most, heavy least).
// You only fight with one primary at a time, so a second primary adds little next to a special for finishing.
export const weaponParts = (ws: Weapon[]): Part[] => {
  const firstOfAmmo = new Map<number, Weapon>();
  for (const w of [...ws].sort((a, b) => (b.duel ?? 0) - (a.duel ?? 0))) if (!firstOfAmmo.has(w.ammo)) firstOfAmmo.set(w.ammo, w);
  // The same perk on two guns counts once: you only fire one gun at a time.
  const seen = new Set<string>();
  const once = (k: K) => { if (k.makes.length === 0 && k.uses.length === 0) return true; if (seen.has(k.name)) return false; seen.add(k.name); return true; };
  return ws.flatMap(w => [...w.ks.filter(k => WEAPON_TYPE[w.type] === k || once(k)).map(k => ({ k })), { k: marker(`__el:${w.element}`) }, { k: marker(`__type:${w.type}`) },
    ...(w.duel ? [{ k: { ...marker(`${w.item.name} (duel stats)`), makes: [`duel:${Math.round(w.duel * (DUEL_SLOT[w.ammo] ?? 0.5) * (firstOfAmmo.get(w.ammo) === w ? 1 : 0.35) * 10) / 10}`] } }] : [])]);
};

export type CoreLike = Pick<Build, "super" | "grenade" | "melee" | "classAbility" | "aspects" | "fragments" | "exotic"> & { subclass?: Subclass };
// The subclass rides along as a marker so perks like "while your Void subclass is equipped" can check it.
export const subMarker = (sub: Subclass): Part => ({ k: { name: `__sub:${ELEMENT[sub]}`, kind: "weapon", makes: [], uses: [], says: "" } });
export function corePartsOf(b: CoreLike): Part[] {
  return [...[b.super, b.grenade, b.melee, b.classAbility, ...b.aspects, ...b.fragments, b.exotic].map(k => ({ k })), ...(b.subclass ? [subMarker(b.subclass)] : [])];
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
  // Higher gear tiers carry enhanced perks, barrels and magazines and a bigger masterwork bonus.
  s += 0.3 * w.tier;
  s += w.item.power / 10000; // last tiebreak: higher Power copies (no infusing needed)
  return s;
}

// Pick the best perk in each column, one column at a time.
function tunePerks(w: Weapon, score: (w: Weapon) => number): { w: Weapon; score: number } {
  const picks = w.cols.map(() => 0);
  let cur = w, best = score(w);
  w.cols.forEach((c, i) => {
    for (let j = 1; j < c.options.length; j++) {
      const trial = picks.map((p, k) => (k === i ? j : p));
      const t = withPerks(w, trial);
      const sc = score(t);
      if (sc > best + 1e-6) { best = sc; cur = t; picks[i] = j; }
    }
  });
  return { w: cur, score: best };
}

// Weapons that would score exactly alike (same slot, element, frame, perks and perk options) collapse to the best copy:
// higher tier, then higher Power. Same answers, a fraction of the work.
const DISTINCT = new WeakMap<Weapon[], Weapon[]>();
export function distinct(weapons: Weapon[], pinned: Set<string>): Weapon[] {
  const hit = DISTINCT.get(weapons);
  if (hit && !pinned.size) return hit;
  const best = new Map<string, Weapon>();
  for (const w of weapons) {
    const sig = [w.item.slot, w.element, w.type, w.item.exotic ? w.item.name : "", Math.round(w.duel ?? 0), ...w.base.map(k => k.name), ...w.cols.map(c => c.options.map(o => o.name).sort().join("/"))].join("|");
    const cur = best.get(sig);
    if (!cur || w.tier > cur.tier || (w.tier === cur.tier && w.item.power > cur.item.power)) best.set(sig, w);
  }
  const out = [...best.values(), ...weapons.filter(w => pinned.has(w.item.id) && !best.has(w.item.id))];
  const uniq = [...new Set(out)];
  if (!pinned.size) DISTINCT.set(weapons, uniq);
  return uniq;
}

// A quick read of what a gun could bring on its own (its best perk per column, discounted when only read from
// Bungie's text), so the full loop scoring only runs on the guns that could matter.
const POTENTIAL = new Map<string, Map<Weapon, number>>();
const amount = (t: string) => { const m = /:(\d+)$/.exec(t); return m ? Number(m[1]) : 1; };
const tok = (t: string) => t.replace(/:\d+$/, "");
function potential(w: Weapon, goal: Goal): number {
  let byGoal = POTENTIAL.get(goal);
  if (!byGoal) { byGoal = new Map(); POTENTIAL.set(goal, byGoal); }
  const hit = byGoal.get(w);
  if (hit !== undefined) return hit;
  const val = (k: K) => ((k as { read?: string }).read === "description" ? 0.35 : 1) * k.makes.reduce((t, m) => t + weightOf(goal, tok(m)) * amount(m), 0);
  const v = w.base.reduce((t, k) => t + val(k), 0) + w.cols.reduce((t, c) => t + Math.max(0, ...c.options.map(val)), 0);
  byGoal.set(w, v);
  return v;
}
const SHORTLIST = 24;

// quick: a fast first pass (short shortlist, slotted perks only) for ranking many builds; the leaders get the full pick.
function chooseWeapons(base: Part[], allWeapons: Weapon[], sub: Subclass, exotic: K, goal: Goal, pinned: Set<string> = new Set(), quick = false): Weapon[] {
  const short = quick ? 8 : SHORTLIST;
  const pool = distinct(allWeapons, pinned);
  // Guns a build piece asks for by element or frame (Volatile Flow wants a Void gun) always make the shortlist.
  const asked = base.flatMap(p => p.k.needs ?? []).join(" ");
  const wanted = (w: Weapon) => asked.includes(`__el:${w.element}`) || asked.includes(`__type:${w.type}`) || byName.get(w.item.name) !== undefined;
  const weapons = (["kinetic", "energy", "power"] as const).flatMap(sl => {
    const inSlot = pool.filter(w => w.item.slot === sl);
    const ranked = inSlot.map(w => ({ w, p: potential(w, goal) + weaponFit(w, sub, exotic, goal) })).sort((a, b) => b.p - a.p);
    const keep = new Set(ranked.slice(0, short).map(x => x.w));
    for (const w of inSlot) if (pinned.has(w.item.id) || (wanted(w) && keep.size < short * 2)) keep.add(w);
    return [...keep];
  });
  const slots: ("kinetic" | "energy" | "power")[] = ["kinetic", "energy", "power"];
  const chosen: Weapon[] = [];
  for (const slot of slots) {
    const pin = weapons.find(w => w.item.slot === slot && pinned.has(w.item.id));
    if (pin) { chosen.push(pin); continue; }
    const cands = weapons.filter(w => w.item.slot === slot && !(w.item.exotic && chosen.some(c => c.item.exotic)));
    const scoreOf = (w: Weapon) => scoreLoops([...base, ...weaponParts([...chosen, w])], goal).score + weaponFit(w, sub, exotic, goal);
    // Rank on the slotted perks, then let the leaders try the other perks in their columns.
    const ranked = cands.map(w => ({ w, sc: scoreOf(w) })).sort((a, b) => b.sc - a.sc);
    let best: Weapon | undefined, bestScore = -Infinity;
    for (const { w, sc } of ranked.slice(0, quick ? 1 : 8)) {
      if (quick) { best = w; break; }
      const tuned = tunePerks(w, x => scoreOf(x));
      const s2 = Math.max(sc, tuned.score);
      if (s2 > bestScore) { bestScore = s2; best = tuned.score > sc ? tuned.w : w; }
    }
    if (best) chosen.push(best);
  }
  if (quick) return chosen;
  // One more pass with all three guns on: a gun that pairs with the heavy (or the heavy with it) can now win its slot.
  const total = (ws: Weapon[]) => scoreLoops([...base, ...weaponParts(ws)], goal).score + ws.reduce((t, w) => t + weaponFit(w, sub, exotic, goal), 0);
  for (let i = 0; i < chosen.length; i++) {
    const slot = chosen[i].item.slot;
    if (pinned.has(chosen[i].item.id)) continue;
    let bestScore = total(chosen);
    for (const w of weapons) {
      if (w.item.slot !== slot || w === chosen[i]) continue;
      if (w.item.exotic && chosen.some((c, j) => j !== i && c.item.exotic)) continue;
      const trial = chosen.map((c, j) => (j === i ? w : c));
      const sc = total(trial);
      if (sc > bestScore + 1e-6) { bestScore = sc; chosen[i] = w; }
    }
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
  require?: Require; // "build around": pieces the player insists on
}

export interface Require { subclass?: Subclass; super?: string; grenade?: string; melee?: string; classAbility?: string; aspects?: string[]; fragments?: string[]; exotic?: string; artifact?: string; artifactPerks?: string[] }

export function searchBuilds(o: SearchInput): Build[] {
  const kit = availableKit(o.inv, o.defOf, o.characterId);
  const exotics = [...new Set(o.inv.items.filter(i => i.kind === "armor" && i.exotic && i.cls === "Hunter").map(i => i.name))]
    .map(n => byName.get(n)).filter((k): k is K => !!k && k.kind === "exotic")
    .filter(k => !o.onlyExotic || k.name === o.onlyExotic)
    .filter(k => !o.require?.exotic || k.name === o.require.exotic);
  const weapons = ownedWeapons(o.inv, o.defOf, o.inv.characters.find(c => c.id === o.characterId)?.light ?? 0);

  // Stage 1: every core (super, grenade, melee, dodge, two aspects, exotic) scored on its loops.
  type Core = Omit<Build, "loops" | "score" | "armor" | "bonus" | "goal" | "weapons">;
  const cores: { c: Core; s: number }[] = [];
  const R = o.require ?? {};
  const only = (list: K[], name?: string) => (name ? list.filter(k => k.name === name) : list);
  for (const [sub, names] of kit) {
    if (o.onlySubclass && sub !== o.onlySubclass) continue;
    if (R.subclass && sub !== R.subclass) continue;
    // A required piece this subclass can't use rules the subclass out.
    const needed = [R.super, R.grenade, R.melee, R.classAbility, ...(R.aspects ?? []), ...(R.fragments ?? [])].filter((x): x is string => !!x);
    if (needed.some(n => !names.has(n) || !byName.get(n)?.subs?.includes(sub))) continue;
    const supers = only(pick(names, sub, "super"), R.super), grenades = only(pick(names, sub, "grenade"), R.grenade), melees = only(pick(names, sub, "melee"), R.melee),
      classes = only(pick(names, sub, "classAbility"), R.classAbility), aspects = pick(names, sub, "aspect");
    const pairs: K[][] = [];
    for (let i = 0; i < aspects.length; i++) for (let j = i + 1; j < aspects.length; j++) pairs.push([aspects[i], aspects[j]]);
    if (!pairs.length && aspects.length) pairs.push([aspects[0]]);
    const reqAsp = R.aspects ?? [];
    for (let i = pairs.length - 1; i >= 0; i--) if (!reqAsp.every(a => pairs[i].some(x => x.name === a))) pairs.splice(i, 1);
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
    const chosen: K[] = (o.require?.fragments ?? []).map(n => byName.get(n)).filter((x): x is K => !!x).slice(0, slots);
    for (let i = chosen.length; i < slots; i++) {
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
    const ws = chooseWeapons(corePartsOf(core), weapons, c.subclass, c.exotic, o.goal, new Set(o.pinnedWeapons ?? []), true);
    const parts = [...corePartsOf(core), ...weaponParts(ws)];
    const loops = scoreLoops(parts, o.goal);
    const key = `${c.subclass}|${c.exotic.name}`;
    const bonus = fragmentBonus(chosen, o.defs);
    const b: Build = { ...core, goal: o.goal, weapons: ws, loops, score: loops.score + STAT_POINT * statTotal(bonus), bonus };
    out.push(b);
    void seen; void key;
  }
  out.sort((a, b) => b.score - a.score);
  // Stage 2b: the leaders get the full weapon pick (more guns, free perk switches, a second pass).
  for (const b of out.slice(0, 40)) {
    b.weapons = chooseWeapons(corePartsOf(b), weapons, b.subclass, b.exotic, o.goal, new Set(o.pinnedWeapons ?? []));
    b.loops = scoreLoops([...corePartsOf(b), ...weaponParts(b.weapons)], o.goal);
    b.score = b.loops.score + STAT_POINT * statTotal(b.bonus);
  }
  out.sort((a, b) => b.score - a.score);
  // Stage 3: the leading builds pick an artifact and its perks (all seven artifacts, every perk Bungie offers).
  const arts = o.goal === "trials" ? [] : artifactsOf(o.inv, o.defOf, o.characterId); // artifacts are off in Trials and Competitive
  if (arts.length) {
    const pinned = new Set(o.pinnedWeapons ?? []);
    for (const b of out.slice(0, 8)) {
      // Artifact and weapons shape each other (Volatile Flow wants a Void gun), so for each artifact: fit perks,
      // re-pick weapons with those perks in play, then fit perks again for the final weapons.
      let best: { fit: NonNullable<ReturnType<typeof bestArtifact>>; ws: Weapon[]; score: number } | undefined;
      for (const a of arts) {
        if (o.require?.artifact && a.name !== o.require.artifact) continue;
        const lock = o.require?.artifactPerks ?? [];
        // Seeds: the perks that fit today's weapons, plus each perk that asks for a weapon element or type
        // (Volatile Flow wants a Void gun), so a perk is never skipped just because the right gun isn't on yet.
        const seeds: string[][] = [lock];
        const seen = new Set<string>();
        for (const sk of a.sockets) for (const opt of sk.options) {
          if (seen.has(opt.name) || lock.includes(opt.name)) continue;
          seen.add(opt.name);
          if (opt.needs?.some((n: string) => n.includes("__el:") || n.includes("__type:"))) seeds.push([...lock, opt.name]);
        }
        for (const seed of seeds) {
          const first = bestArtifact([...corePartsOf(b), ...weaponParts(b.weapons)], o.goal, [a], undefined, seed);
          if (!first) continue;
          const ws = chooseWeapons([...corePartsOf(b), ...first.perks.map(p => ({ k: p.perk }))], weapons, b.subclass, b.exotic, o.goal, pinned, true);
          const fit = bestArtifact([...corePartsOf(b), ...weaponParts(ws)], o.goal, [a], undefined, lock)!;
          if (!best || fit.score > best.score) best = { fit, ws, score: fit.score };
        }
      }
      if (!best) continue;
      // The winning artifact's perks in play, the full weapon pick, then the perks fitted to those final guns.
      const art = arts.find(a => a.name === best!.fit.artifact.name);
      const full = chooseWeapons([...corePartsOf(b), ...best.fit.perks.map(p => ({ k: p.perk }))], weapons, b.subclass, b.exotic, o.goal, pinned);
      const refit = art ? bestArtifact([...corePartsOf(b), ...weaponParts(full)], o.goal, [art], undefined, o.require?.artifactPerks ?? []) : undefined;
      if (refit && refit.score >= best.score - 1e-6) best = { fit: refit, ws: full, score: refit.score };
      b.artifact = best.fit;
      b.weapons = best.ws;
      b.loops = scoreLoops([...corePartsOf(b), ...weaponParts(best.ws), ...best.fit.perks.map(p => ({ k: p.perk }))], o.goal);
      b.score = b.loops.score + STAT_POINT * statTotal(b.bonus);
    }
    out.splice(8);
    out.sort((a, b) => b.score - a.score);
  }
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
export type StatStyle = "peaks" | "even";
// Targets: your minimum per stat (50 if you don't set one). 100 means "Keep at 100+", which the solver treats as a must.
export type StatTargets = Partial<Record<StatKey, number>>;
const STAT_BUDGET = 2.4;
const PAST_BY_GOAL: Partial<Record<Goal, Partial<Record<StatKey, number>>>> = {
  bossDps: { super: 1.6, weapons: 1.4 },
  abilities: { grenade: 1.3, melee: 1.2 },
};
export function planFor(b: Pick<Build, "super" | "grenade" | "melee" | "classAbility" | "aspects" | "fragments" | "exotic" | "weapons">, goal: Goal, targets: StatTargets = {}, style: StatStyle = "peaks"): StatPlan {
  const lean = statLean([...corePartsOf(b), ...weaponParts(b.weapons)], goal);
  // Every build gets the same stat budget: its weights are scaled so they add up to STAT_BUDGET. Before, a build
  // that leaned on many stats earned more stat points for the same numbers, which skewed the ranking across subclasses.
  const sum = Math.max(Object.values(lean).reduce((t, v) => t + Math.max(0, v), 0), 0.01);
  const plan = {} as StatPlan;
  for (const k of STAT_ORDER) {
    const w = Math.min(1, (Math.max(0, lean[k]) / sum) * STAT_BUDGET); // 0..1
    const floor = targets[k] ?? 50, hard = (targets[k] ?? 0) >= 100;
    // Past 100, stats add damage (Bungie: Super up to +45% super damage, Grenade +65%, Melee +30%, Weapons +15%
    // primary and special / +10% heavy vs bosses, Class up to a 40 HP overshield). Boss damage leans on Super and Weapons.
    const past = (isPvp(goal) ? PVP_PAST_100[k] ?? 0.3 : 1) * (PAST_BY_GOAL[goal]?.[k] ?? 1);
    // Every point counts (points past 100 still buy real bonuses); the loop's stats count more.
    plan[k] = style === "peaks"
      ? { floor, hard, low: 0.5 + 0.7 * w, high: past * (0.2 + 0.4 * w), peak: (isPvp(goal) ? 0.6 : 1) * (0.4 + 1.0 * w) }
      : { floor, hard, low: 0.7 + 0.6 * w, high: past * (0.35 + 0.4 * w) };
  }
  return plan;
}

export function fitArmor(b: Build, pieces: Piece[], o: { mw: "asIs" | "full"; wornIds?: Set<string>; minPower?: number; style?: StatStyle }) {
  const plan = planFor(b, b.goal, {}, o.style);
  return solve(pieces, { cls: "Hunter", exotic: b.exotic.name, plan, bonus: b.bonus, mw: o.mw, wornIds: o.wornIds, top: 1, minPower: o.minPower })[0];
}

export { readPiece };
