import { byName, type K } from "./hunter";

// Artifact perks. Monument of Triumph has seven artifacts with 21 perks each, and Bungie can describe all of
// them, so instead of hand-typing ~150 entries Steeped reads each perk's own description and turns it into
// makes/uses tokens. Perks Claude has checked by hand (in hunter.ts) win over the reading.

const ELEMENTS = ["Arc", "Solar", "Void", "Stasis", "Strand", "Kinetic"];
const TYPES: [RegExp, string][] = [
  [/auto rifle/i, "Auto Rifle"], [/glaive/i, "Glaive"], [/sniper/i, "Sniper Rifle"], [/shotgun/i, "Shotgun"],
  [/grenade launcher/i, "Grenade Launcher"], [/sword/i, "Sword"], [/\bbows?\b/i, "Combat Bow"], [/linear fusion/i, "Linear Fusion Rifle"],
  [/(?<!linear )fusion rifle/i, "Fusion Rifle"], [/trace rifle/i, "Trace Rifle"], [/machine gun/i, "Machine Gun"], [/rocket launcher/i, "Rocket Launcher"],
  [/hand cannon/i, "Hand Cannon"], [/pulse rifle/i, "Pulse Rifle"], [/scout rifle/i, "Scout Rifle"], [/sidearm/i, "Sidearm"], [/submachine gun|\bsmg/i, "Submachine Gun"],
  [/micro-missile/i, "micro-missile weapon"],
];

// What a perk produces, from words in its description.
const MAKES: [RegExp, string][] = [
  [/volatile/i, "volatile"], [/creates? an orb|spawns? an orb|generate.*orb|orbs? of power.*(create|spawn)/i, "orb"], [/frost armor/i, "frost"],
  [/radiant/i, "radiant"], [/restoration/i, "restoration"], [/woven mail/i, "woven"], [/overshield/i, "overshield"], [/damage resistance/i, "dr"],
  [/\bheal|cure/i, "heal"], [/amplified/i, "amplified"], [/bolt charge/i, "bolt"], [/threadling/i, "threadling"], [/unravel/i, "unravel"],
  [/weaken/i, "weaken"], [/\bjolt/i, "jolt"], [/scorch/i, "scorch"], [/ignit/i, "ignite"], [/\bfreez/i, "freeze"], [/\bslow/i, "slow"],
  [/stasis crystal/i, "crystal"], [/shatter/i, "shatter"], [/\bsever/i, "sever"], [/suppress/i, "suppress"], [/\bblind/i, "blind"],
  [/invisib/i, "invis"], [/devour/i, "devour"], [/void breach/i, "breach"], [/class ability energy/i, "cEn"], [/grenade energy/i, "gEn"],
  [/melee energy/i, "mEn"], [/super energy/i, "sEn"], [/heavy ammo/i, "ammo"], [/\bammo/i, "ammo"], [/reload/i, "reload"],
  [/(increased|bonus to|more|bonus) .*damage|damage (bonus|increase)/i, "dmg"], [/explo|burst|pulse|shockwave|detonat/i, "multikill"],
  [/champion/i, "champion"], [/allies|teammates/i, "teamBuff"],
];
// What it needs to happen first ("Picking up an Orb", "Defeating a Void debuffed target"...).
const USES: [RegExp, string][] = [
  [/picking up an orb|orb of power.*pick/i, "orbPickup"], [/picking up a void breach/i, "breach"], [/precision/i, "kPrecision"],
  [/debuffed|(defeating|damaging) .*(scorched|jolted|weakened|frozen|slowed|severed|unraveled|suspended|volatile)/i, "kDebuffed"],
  [/frozen|freez/i, "freeze"], [/slowed/i, "slow"], [/severed/i, "sever"], [/unraveled/i, "unravel"], [/stunning a champion/i, "champion"],
  [/while .*amplified/i, "amplified"], [/while .*radiant/i, "radiant"], [/while .*(frost armor)/i, "frost"], [/while .*woven mail/i, "woven"],
  [/(arc|solar|void|stasis|strand) grenade/i, "gEn"], [/bolt charge/i, "bolt"], [/void breach/i, "breach"], [/finisher/i, "finisher"], [/elemental buff/i, "radiant|frost|woven|overshield|amplified|restoration|invis"],
];

export interface ArtifactPerk extends K { hash: number; read: "checked" | "description" }

export function perkKnowledge(hash: number, name: string, desc: string, kind: "artifact" | "weapon" | "exotic" = "artifact"): ArtifactPerk {
  const hand = byName.get(name);
  if (hand && hand.kind === kind) return { ...hand, hash, read: "checked" };
  const text = desc.replace(/\[[^\]]*\]/g, " ");
  const makes = new Set<string>(), uses = new Set<string>();
  // A perk's trigger usually comes first ("Defeating X ... grants Y"); split on the first "grants/creates/gives".
  const [cause, effect] = splitCause(text);
  for (const [re, t] of USES) if (re.test(cause)) uses.add(t);
  for (const [re, t] of MAKES) if (re.test(effect)) makes.add(t);
  for (const t of uses) for (const x of t.split("|")) if (x !== "kDebuffed" && x !== "kPrecision") makes.delete(x); // the trigger isn't also the payoff
  // Weapon or subclass conditions: "Void weapons", "Auto Rifle", "while your Void or Prismatic subclass is equipped".
  // Gear conditions (any of them) and subclass conditions (any of them); when a perk has both, it needs one of each.
  const gear: string[] = [], subs: string[] = [];
  for (const el of ELEMENTS) if (new RegExp(`${el} weapons?`, "i").test(text)) gear.push(`__el:${el}`);
  for (const [re, t] of TYPES) if (re.test(text)) gear.push(`__type:${t}`);
  const sub = /while your ([A-Za-z ]+?) subclass/i.exec(text);
  if (sub) for (const el of [...ELEMENTS, "Prismatic"]) if (sub[1].includes(el)) subs.push(`__sub:${el}`);
  for (const el of ELEMENTS) if (new RegExp(`${el} (grenades?|melees?|abilit|supers?|class abilit)`, "i").test(text) && !subs.includes(`__sub:${el}`)) subs.push(`__sub:${el}`);
  if (subs.length && !subs.includes("__sub:Prismatic") && !sub) subs.push("__sub:Prismatic");
  const needs = gear.length && subs.length ? gear.flatMap(g => subs.map(x => `${g}+${x}`)) : [...gear, ...subs];
  const role: string[] = [];
  if (makes.has("multikill")) role.push("adClear");
  if (makes.has("dr") || makes.has("overshield") || makes.has("heal")) role.push("survival");
  return {
    name, kind, makes: [...makes], uses: [...uses], needs: needs.length ? needs : undefined, role,
    says: desc.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim(), hash, read: "description",
  };
}

function splitCause(text: string): [string, string] {
  const re = /\b(grants?|gives?|creates?|spawns?|causes?|generates?|emits?|applies|applying|deals?|you gain|you also|provides?|refunds?|releases?|sends?|turns?)\b/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) if (m.index >= 12) return [text.slice(0, m.index), text.slice(m.index)];
  return ["", text];
}
