import type { StatKey } from "../bungie/config";
import { COMBOS, type Combo, type K, type Kind, type Subclass } from "../knowledge/hunter";
import { isStasis } from "../knowledge/classes";

// ---------- Goals: what you want the build to be good at ----------
export type Goal = "whole" | "abilities" | "bossDps" | "survival" | "team" | "crucible" | "trials";
export const isPvp = (g: Goal) => g === "crucible" || g === "trials";
export const GOAL_LABEL: Record<Goal, string> = {
  whole: "All-round (clear rooms, hurt bosses, stay alive solo)",
  abilities: "Ability loop (general PvE)",
  bossDps: "Boss damage (raids)",
  survival: "Survival (hard content)",
  team: "Team support (raids)",
  crucible: "Crucible (Quickplay, Control, Iron Banner)",
  trials: "Trials and Competitive (no artifact)",
};

// How much each made token is worth for a goal. Unlisted tokens are worth 0.3.
// PvP (Steeped's judgment): winning duels is the weapons' stats ("duel") plus abilities that kill, lock down or
// save you. Pack-clearing, boss damage and champions are worth nothing against players.
const PVP: Record<string, number> = {
  duel: 2, gEn: 2.5, mEn: 2.5, cEn: 2.5, sEn: 1.5, kGrenade: 2, kMelee: 2, kAbility: 1.5, kPrecision: 1.5, kWeapon: 1, freeze: 2, slow: 1.5,
  suppress: 1.5, blind: 1.5, invis: 1, jolt: 1, scorch: 1, weaken: 1, sever: 1, overshield: 2, heal: 2, restoration: 2, dr: 1.5, woven: 1.5, frost: 1.5,
  radiant: 1.5, amplified: 1.2, reload: 1, dmg: 1, shatter: 1, crystal: 0.5, multikill: 0.3, volatile: 0.3, ignite: 0.5, orb: 0.5, ammo: 0.5, teamBuff: 0.8,
  bossDmg: 0, champion: 0, breach: 0.2,
};
const GOAL_WEIGHTS: Record<Goal, Record<string, number>> = {
  crucible: PVP, trials: PVP,
  // Kill power counts most; control (freeze, slow, crystals) only matters once something turns it into kills.
  whole: { multikill: 4, bossDmg: 3, gEn: 2.5, mEn: 2, cEn: 2, sEn: 1.5, dmg: 2, kGrenade: 1.5, kAbility: 1.5, kMelee: 1.2, kWeapon: 1.5, shatter: 1.5, ignite: 1.5, volatile: 1.5, orb: 1.2, frost: 1.5, overshield: 2, heal: 2, dr: 2, cure: 1.5, restoration: 1.5, invis: 1.2, woven: 1.5, weaken: 1.5, radiant: 1.5, reload: 0.8, ammo: 1, champion: 1, freeze: 0.5, slow: 0.4, crystal: 0.5, devour: 1.5, threadling: 1.2, suspend: 1, unravel: 1, jolt: 1, amplified: 0.8 },
  abilities: { multikill: 3, gEn: 3, mEn: 3, cEn: 2.5, kAbility: 1.5, kGrenade: 1.5, kMelee: 1.5, freeze: 0.6, slow: 0.6, shatter: 1.2, crystal: 0.6, ignite: 1.2, jolt: 1, sever: 1, volatile: 1, weaken: 1, orb: 1, frost: 1, invis: 1, heal: 1, dr: 1, overshield: 1, dmg: 1, threadling: 1.2, suspend: 1, unravel: 1, devour: 1, amplified: 0.8 },
  bossDps: { bossDmg: 4, sEn: 2.5, radiant: 2, weaken: 2, teamBuff: 1.5, dmg: 1.5, orb: 1.5, heal: 0.8, dr: 0.8, overshield: 0.8, frost: 0.6, reload: 0.8 },
  survival: { devour: 2.5, suspend: 1.2, heal: 3, dr: 3, frost: 2.5, overshield: 2.5, invis: 2.5, woven: 2.5, restoration: 2.5, cure: 2, slow: 1.5, freeze: 1.5, weaken: 1.5, suppress: 1.5, blind: 1.5, cEn: 1.5, gEn: 1.2, mEn: 1.2, dmg: 1 },
  team: { teamBuff: 3, radiant: 2.5, weaken: 2.5, heal: 2, restoration: 2, invis: 1.5, dr: 1.5, bossDmg: 1.5, sEn: 1, orb: 1.5 },
};
export const weightOf = (goal: Goal, token: string) => GOAL_WEIGHTS[goal][token] ?? 0.3;
const ENERGY: Record<string, Kind> = { gEn: "grenade", mEn: "melee", cEn: "classAbility", sEn: "super" };
const ENERGY_OF: Partial<Record<Kind, string>> = { grenade: "gEn", melee: "mEn", classAbility: "cEn" };
// How much feeding speeds a piece up: diminishing, so a second source still helps but less (tops out near 1.7x).
export const SPEED = 0.7;
const speedUp = (r: number) => 1 + SPEED * (1 - Math.exp(-r / 3));
const DEBUFFS = ["slow", "freeze", "weaken", "scorch", "jolt", "sever", "suppress", "blind", "volatile", "unravel", "suspend", "ignite"];
// Things you can always do, so they never count as missing.
const ALWAYS = new Set(["kWeapon", "sprint", "airborne", "finisher"]);

export interface Part { k: K; why?: string }
export interface BuildCore {
  subclass: Subclass;
  parts: Part[]; // super, grenade, melee, class ability, aspects, fragments, exotic, weapon perks
}

const parse = (t: string): [string, number] => { const [a, b] = t.split(":"); return [a, b ? Number(b) : 1]; };

export interface LoopReport {
  score: number;
  combos: Combo[]; // signature pairings this build has
  made: Map<string, { total: number; by: string[] }>;
  links: { from: string; to: string; token: string }[];
  energy: { kind: Kind; ability: string; refills: string[] }[];
  unfed: { name: string; token: string }[];
  survives: string[]; // Max Hunter: what the build is missing to survive solo (empty = solo-ready)
  speeds: Map<string, number>; // how hard each piece runs: 1 = normal, up to about 1.7 when it's fed a lot
}

// "__el:Void" -> "a Void weapon", "__sub:Void" -> "a Void subclass", "__type:Auto Rifle" -> "an Auto Rifle".
const needWords = (n: string) => n.startsWith("__el:") ? `a ${n.slice(5)} weapon` : n.startsWith("__sub:") ? `a ${n.slice(6)} subclass`
  : n.startsWith("__type:") ? `${/^[AEIOU]/.test(n.slice(7)) ? "an" : "a"} ${n.slice(7)}` : n;

// Pieces every build carries without picking them: today that is your equipped artifact's perks.
let AMBIENT: Part[] = [];
export function setAmbient(ks: K[]) { AMBIENT = ks.map(k => ({ k, why: "artifact" })); }
export const ambient = () => AMBIENT;

export function scoreLoops(given: Part[], goal: Goal): LoopReport {
  const parts = [...given, ...AMBIENT.filter(a => !given.some(g => g.k.name === a.k.name))];
  const names = new Set(parts.map(p => p.k.name));
  // A piece whose hard requirement is missing (Orpheus Rig without Deadfall) does nothing at all.
  // "a+b" in needs means both; the list itself is any-of.
  const dead = new Set(parts.filter(p => p.k.needs && !p.k.needs.some(n => n.split("+").every(x => names.has(x)))).map(p => p.k.name));
  const live = parts.filter(p => !dead.has(p.k.name));
  // Perks Steeped only read from Bungie's text (not hand-checked) count for less, so a guess can't outrank a known piece.
  const UNVERIFIED = 0.35;
  const trust = (n: string) => ((parts.find(p => p.k.name === n)?.k as { read?: string } | undefined)?.read === "description" ? UNVERIFIED : 1);

  const buildMade = (factor: (p: Part) => number) => {
    const made = new Map<string, { total: number; by: string[] }>();
    const addMade = (t: string, n: number, by: string) => {
      const m = made.get(t) ?? { total: 0, by: [] };
      m.total += n;
      if (!m.by.includes(by)) m.by.push(by);
      made.set(t, m);
    };
    for (const p of live) {
      const f = factor(p) * (p.k.kind === "super" ? 0.5 : 1) * trust(p.k.name);
      if (f > 0) for (const raw of p.k.makes) { const [t, n] = parse(raw); addMade(t, n * f, p.k.name); }
    }
    // Derived: abilities make kills of their kind; debuffs plus any kill make "kDebuffed"; orbs get picked up.
    for (const p of live) {
      const f = Math.max(1, factor(p)); // a faster ability gets more kills and casts
      if (p.k.kind === "grenade") addMade("kGrenade", 0.5 * f, p.k.name);
      if (p.k.kind === "melee") addMade("kMelee", 0.5 * f, p.k.name);
      if (["grenade", "melee"].includes(p.k.kind)) addMade("kAbility", 0.5 * f, p.k.name);
      if (p.k.kind === "classAbility") addMade("dodge", 1 * f, p.k.name);
    }
    const debuffers = DEBUFFS.filter(d => made.has(d));
    if (debuffers.length) addMade("kDebuffed", 1, made.get(debuffers[0])!.by[0]);
    if (made.has("orb")) addMade("orbPickup", made.get("orb")!.total, made.get("orb")!.by[0]);
    addMade("kPrecision", 0.5, "your weapons");
    addMade("orbPickup", 0.5, "orbs from teammates");
    if (made.has("freeze")) addMade("shatter", 0.5, "your weapons breaking frozen enemies");
    // Stasis shards are built into every Stasis subclass now: shatters and slowed or frozen kills drop them.
    if (live.some(p => p.k.subs?.some(isStasis)) && ["freeze", "slow", "shatter"].some(t => made.has(t))) addMade("shard", 1, "Stasis (built in)");
    // Picking up a Stasis shard gives Frost Armor on every Stasis subclass (Final Shape onward).
    if (made.has("shard") && live.some(p => p.k.subs?.some(isStasis))) addMade("frost", 1, "Stasis shards (built in)");
    // Signature combos add what the pairing really produces.
    for (const c of combos) for (const raw of c.makes) { const [t, n] = parse(raw); addMade(t, n, c.name); }
    return made;
  };
  // A use is met when another piece makes any of its alternatives ("a|b|c").
  const sourceFor = (made: Map<string, { total: number; by: string[] }>, use: string, self: string) => {
    for (const alt of use.split("|")) {
      const by = made.get(alt)?.by.find(b => b !== self);
      if (by) return { by, token: alt };
    }
    return null;
  };
  const triggers = (p: Part) => p.k.uses.map(u => parse(u)).filter(([t]) => !(ENERGY[t] && p.k.kind === ENERGY[t]) && !ALWAYS.has(t));

  const has = (cond: string, made: Map<string, unknown>) => cond.split("|").some(c => (c.startsWith("@") ? made.has(c.slice(1)) : names.has(c) && !dead.has(c)));
  let combos: Combo[] = [];
  const pre = buildMade(() => 1);
  combos = COMBOS.filter(c => !(c.pve && isPvp(goal)) && c.all.every(cond => has(cond, pre)));
  // Pass 1 decides which pieces get triggered; pass 2 counts an untriggered piece's effects at 40%.
  const first = buildMade(() => 1);
  const triggered = new Set(live.filter(p => { const tr = triggers(p); return !tr.length || tr.some(([t]) => sourceFor(first, t, p.k.name)); }).map(p => p.k.name));
  const base = (p: Part) => (triggered.has(p.k.name) ? 1 : p.k.kind === "artifact" ? 0 : 0.4); // an idle artifact perk does nothing at all
  // Loop speed: a piece fires as often as what feeds it. An ability comes back faster with more of its energy
  // (Monte Carlo and Mask of Fealty both refill melee), and a piece triggered by a token runs harder when that
  // token is made a lot (many blades: many crystals, many shatters, many shards). Two passes carry the speed
  // down a chain (melee energy, then blades, then crystals, then shards, then Frost Armor).
  const others = (m: Map<string, { total: number; by: string[] }>, t: string, self: K) =>
    Math.max(0, (m.get(t)?.total ?? 0) - self.makes.filter(x => parse(x)[0] === t).reduce((a, x) => a + parse(x)[1], 0));
  // Pieces that fire on an ability cast (Mask of Fealty on Withering Blade hits, a perk on dodging) run exactly
  // as fast as that ability.
  const CAST: Record<string, Kind[]> = { kMelee: ["melee"], kGrenade: ["grenade"], kAbility: ["melee", "grenade"], dodge: ["classAbility"] };
  const speedOf = (p: Part, m: Map<string, { total: number; by: string[] }>, sp: Map<string, number>) => {
    if (base(p) < 1 || p.k.kind === "super") return 1;
    const own = ENERGY_OF[p.k.kind];
    if (own) return speedUp(others(m, own, p.k));
    const tr = triggers(p);
    if (!tr.length) return 1;
    let best = 1;
    for (const [t] of tr) for (const alt of t.split("|")) {
      const kinds = CAST[alt];
      const cast = kinds ? Math.max(1, ...live.filter(x => kinds.includes(x.k.kind)).map(x => sp.get(x.k.name) ?? 1)) : 1;
      best = Math.max(best, cast, speedUp(Math.max(others(m, alt, p.k) - 1, 0)));
    }
    return best;
  };
  let made = buildMade(base);
  let speeds = new Map<string, number>(live.map(p => [p.k.name, 1]));
  for (let pass = 0; pass < 3; pass++) {
    const prev = made, sp = speeds;
    speeds = new Map(live.map(p => [p.k.name, speedOf(p, prev, sp)]));
    made = buildMade(p => base(p) * (speeds.get(p.k.name) ?? 1));
  }

  const W = GOAL_WEIGHTS[goal];
  let score = 0;
  // Capped so one effect can't carry a build; the goal's main effects get more room to separate good from great.
  // Past the cap an effect still counts, at a quarter, so stacking more kill power is never worth zero.
  // Duel ratings add up per gun (0-10 each), so they get a wider cap; PvE goals ignore them entirely.
  for (const [t, m] of made) { const cap = t === "duel" ? 30 : (W[t] ?? 0) >= 3 ? 10 : 3; score += (t === "duel" && !(t in W) ? 0 : (W[t] ?? 0.3)) * (Math.min(m.total, cap) + 0.25 * Math.max(0, m.total - cap)); }

  const links: LoopReport["links"] = [];
  const unfed: LoopReport["unfed"] = [];
  for (const p of live) {
    for (const [t, n] of triggers(p)) {
      const src = sourceFor(made, t, p.k.name);
      if (src) {
        const fromSuper = parts.find(x => x.k.name === src.by)?.k.kind === "super";
        links.push({ from: src.by, to: p.k.name, token: src.token });
        score += (fromSuper ? 0.6 : 1.5) * n * Math.min(trust(p.k.name), trust(src.by)); // a super comes up a few times per fight; abilities and weapons all the time
      }
      else if (p.k.kind !== "weapon") unfed.push({ name: p.k.name, token: t.split("|").join(" or ") });
    }
  }
  // Max Hunter is solo-ready: a build must be able to heal and to soak damage, or it can't win, however hard it hits.
  const survives: string[] = [];
  if (goal === "whole") {
    const has = (ts: string[]) => ts.some(t => (made.get(t)?.total ?? 0) > 0);
    // Armor 3.0: Health stat up to 100 heals you on every Orb of Power you pick up, so a build that makes its own
    // orbs can heal, just not on demand. It costs a little instead of the full penalty.
    const healing = ["heal", "cure", "restoration", "devour"].reduce((t, k) => t + (made.get(k)?.total ?? 0), 0);
    if (healing < 1) {
      if (healing > 0 || has(["orb"])) { score -= 6; survives.push(healing > 0 ? "heals only in some fights" : "only heals from Orbs of Power"); }
      else { score -= 25; survives.push("no way to heal"); }
    }
    if (!has(["dr", "overshield", "frost", "invis", "woven"])) { score -= 25; survives.push("nothing that cuts the damage you take"); }
  }
  const isArtifact = (n: string) => parts.find(p => p.k.name === n)?.k.kind === "artifact";
  // Artifact perks are always on, so an idle one costs nothing; it just shows as a missed chance.
  score -= 1.2 * unfed.filter(u => !isArtifact(u.name)).length;
  for (const d of dead) {
    const need = (parts.find(p => p.k.name === d)!.k.needs ?? []).map(n => n.split("+").map(needWords).join(" with ")).join(" or ");
    unfed.push({ name: d, token: need });
    if (!isArtifact(d)) score -= 8;
  }

  const energy: LoopReport["energy"] = [];
  for (const [t, kind] of Object.entries(ENERGY)) {
    const ability = live.find(p => p.k.kind === kind);
    if (!ability) continue;
    const refills = (made.get(t)?.by ?? []).filter(b => b !== ability.k.name);
    if (refills.length) {
      energy.push({ kind, ability: ability.k.name, refills });
      score += (W[t] ?? 1) * Math.min(refills.length, 3);
    }
  }
  return { score, combos, made, links, energy, unfed, survives, speeds };
}

// Which stats this build leans on, from what its pieces want and which abilities it refills.
export function statLean(parts: Part[], goal: Goal): Record<StatKey, number> {
  const lean: Record<StatKey, number> = { health: 0.3, melee: 0, grenade: 0, super: 0, class: 0, weapons: 0.3 };
  for (const p of parts) for (const [k, v] of Object.entries(p.k.wants ?? {})) lean[k as StatKey] += (v as number) * (p.k.kind === "exotic" ? 2 : 1);
  // A signature combo tells us which ability actually does the killing, so its stat comes first.
  for (const c of scoreLoops(parts, goal).combos) for (const [k, v] of Object.entries(c.wants ?? {})) lean[k as StatKey] += v as number;
  // What the goal itself asks of your stats.
  if (goal === "bossDps") { lean.super += 2; lean.weapons += 1.5; }
  if (goal === "whole") { lean.weapons += 1; }
  if (goal === "survival") { lean.health += 2; }
  if (goal === "team") { lean.class += 1; lean.super += 1; }
  // PvP: reload and handling (Weapons), dodge (Class) and flinch resistance plus shield recharge (Health) matter in every duel.
  if (isPvp(goal)) { lean.weapons += 1.2; lean.class += 0.8; lean.health += 0.8; }
  return lean;
}
