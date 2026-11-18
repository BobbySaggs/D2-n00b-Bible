import type { StatKey } from "../bungie/config";
import type { K, Kind, Subclass } from "../knowledge/hunter";

// ---------- Goals: what you want the build to be good at ----------
export type Goal = "abilities" | "bossDps" | "survival" | "team";
export const GOAL_LABEL: Record<Goal, string> = {
  abilities: "Ability loop (general PvE)",
  bossDps: "Boss damage (raids)",
  survival: "Survival (hard content)",
  team: "Team support (raids)",
};

// How much each made token is worth for a goal. Unlisted tokens are worth 0.3.
const GOAL_WEIGHTS: Record<Goal, Record<string, number>> = {
  abilities: { gEn: 3, mEn: 3, cEn: 2.5, kAbility: 1.5, kGrenade: 1.5, kMelee: 1.5, freeze: 1, slow: 1, shatter: 1.2, crystal: 1, ignite: 1.2, jolt: 1, sever: 1, volatile: 1, weaken: 1, orb: 1, frost: 1, invis: 1, heal: 1, dr: 1, overshield: 1, dmg: 1 },
  bossDps: { bossDmg: 4, sEn: 2.5, radiant: 2, weaken: 2, teamBuff: 1.5, dmg: 1.5, orb: 1.5, heal: 0.8, dr: 0.8, overshield: 0.8, frost: 0.6, reload: 0.8 },
  survival: { heal: 3, dr: 3, frost: 2.5, overshield: 2.5, invis: 2.5, woven: 2.5, restoration: 2.5, cure: 2, slow: 1.5, freeze: 1.5, weaken: 1.5, suppress: 1.5, blind: 1.5, cEn: 1.5, gEn: 1.2, mEn: 1.2, dmg: 1 },
  team: { teamBuff: 3, radiant: 2.5, weaken: 2.5, heal: 2, restoration: 2, invis: 1.5, dr: 1.5, bossDmg: 1.5, sEn: 1, orb: 1.5 },
};
const ENERGY: Record<string, Kind> = { gEn: "grenade", mEn: "melee", cEn: "classAbility", sEn: "super" };
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
  made: Map<string, { total: number; by: string[] }>;
  links: { from: string; to: string; token: string }[];
  energy: { kind: Kind; ability: string; refills: string[] }[];
  unfed: { name: string; token: string }[];
}

export function scoreLoops(parts: Part[], goal: Goal): LoopReport {
  const names = new Set(parts.map(p => p.k.name));
  // A piece whose hard requirement is missing (Orpheus Rig without Deadfall) does nothing at all.
  const dead = new Set(parts.filter(p => p.k.needs && !p.k.needs.some(n => names.has(n))).map(p => p.k.name));
  const live = parts.filter(p => !dead.has(p.k.name));

  const buildMade = (factor: (p: Part) => number) => {
    const made = new Map<string, { total: number; by: string[] }>();
    const addMade = (t: string, n: number, by: string) => {
      const m = made.get(t) ?? { total: 0, by: [] };
      m.total += n;
      if (!m.by.includes(by)) m.by.push(by);
      made.set(t, m);
    };
    for (const p of live) {
      const f = factor(p) * (p.k.kind === "super" ? 0.5 : 1);
      if (f > 0) for (const raw of p.k.makes) { const [t, n] = parse(raw); addMade(t, n * f, p.k.name); }
    }
    // Derived: abilities make kills of their kind; debuffs plus any kill make "kDebuffed"; orbs get picked up.
    for (const p of live) {
      if (p.k.kind === "grenade") addMade("kGrenade", 0.5, p.k.name);
      if (p.k.kind === "melee") addMade("kMelee", 0.5, p.k.name);
      if (["grenade", "melee"].includes(p.k.kind)) addMade("kAbility", 0.5, p.k.name);
      if (p.k.kind === "classAbility") addMade("dodge", 1, p.k.name);
    }
    const debuffers = DEBUFFS.filter(d => made.has(d));
    if (debuffers.length) addMade("kDebuffed", 1, made.get(debuffers[0])!.by[0]);
    if (made.has("orb")) addMade("orbPickup", made.get("orb")!.total, made.get("orb")!.by[0]);
    addMade("kPrecision", 0.5, "your weapons");
    addMade("orbPickup", 0.5, "orbs from teammates");
    if (made.has("freeze")) addMade("shatter", 0.5, "your weapons breaking frozen enemies");
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

  // Pass 1 decides which pieces get triggered; pass 2 counts an untriggered piece's effects at 40%.
  const first = buildMade(() => 1);
  const triggered = new Set(live.filter(p => { const tr = triggers(p); return !tr.length || tr.some(([t]) => sourceFor(first, t, p.k.name)); }).map(p => p.k.name));
  const made = buildMade(p => (triggered.has(p.k.name) ? 1 : 0.4));

  const W = GOAL_WEIGHTS[goal];
  let score = 0;
  // Capped so one effect can't carry a build; the goal's main effects get more room to separate good from great.
  for (const [t, m] of made) score += (W[t] ?? 0.3) * Math.min(m.total, (W[t] ?? 0) >= 3 ? 10 : 3);

  const links: LoopReport["links"] = [];
  const unfed: LoopReport["unfed"] = [];
  for (const p of live) {
    for (const [t, n] of triggers(p)) {
      const src = sourceFor(made, t, p.k.name);
      if (src) {
        const fromSuper = parts.find(x => x.k.name === src.by)?.k.kind === "super";
        links.push({ from: src.by, to: p.k.name, token: src.token });
        score += (fromSuper ? 0.6 : 1.5) * n; // a super comes up a few times per fight; abilities and weapons all the time
      }
      else if (p.k.kind !== "weapon") unfed.push({ name: p.k.name, token: t.split("|").join(" or ") });
    }
  }
  score -= 1.2 * unfed.length;
  for (const d of dead) { unfed.push({ name: d, token: `needs ${(parts.find(p => p.k.name === d)!.k.needs ?? []).join(" or ")}` }); score -= 8; }

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
  return { score, made, links, energy, unfed };
}

// Which stats this build leans on, from what its pieces want and which abilities it refills.
export function statLean(parts: Part[], goal: Goal): Record<StatKey, number> {
  const lean: Record<StatKey, number> = { health: 0.3, melee: 0, grenade: 0, super: 0, class: 0, weapons: 0.3 };
  for (const p of parts) for (const [k, v] of Object.entries(p.k.wants ?? {})) lean[k as StatKey] += (v as number) * (p.k.kind === "exotic" ? 2 : 1);
  // What the goal itself asks of your stats.
  if (goal === "bossDps") { lean.super += 2; lean.weapons += 1.5; }
  if (goal === "survival") { lean.health += 2; }
  if (goal === "team") { lean.class += 1; lean.super += 1; }
  return lean;
}
