import { ARMOR_SLOTS, type Slot, type StatKey } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import type { Piece } from "./armor";
import type { BuildView } from "./evaluate";
import type { Goal } from "./loops";

// Armor mod planner: fills every non-stat mod slot on every piece from the mods you've unlocked, within energy,
// and says why each one is there. Rules are written from Bungie's mod text (Nov 18, 2026 snapshot).
// Armor Charge mods (Fonts, Kickstarts, Weapon Surges, Finishers) are left out on purpose: Bungie's text for them
// came through incomplete, so Steeped won't guess what they do.

export interface ModPick { name: string; hash: number; energy: number; why: string }
export interface PieceMods { slot: Slot; piece: Piece; statMod?: { stat: StatKey; energy: number }; mods: ModPick[]; used: number; capacity: number; open: number }

type Need = { g: number; m: number; c: number; s: number; heal: number; resist: number; ammoH: boolean; ammoS: boolean; elems: string[]; superEl: string; goal: Goal };

const ELS = ["Arc", "Solar", "Void", "Stasis", "Strand", "Kinetic"];

function needs(v: BuildView): Need {
  const e = (k: string) => v.loops.energy.find(x => x.kind === k)?.refills.length ?? 0;
  const lean = (k: StatKey) => Object.values(v.parts).reduce((t, p) => t + (p.wants?.[k] ?? 0), 0);
  const goal = v.spec.goal;
  const ws = v.weapons.filter(Boolean);
  const superEl = v.parts.find(p => p.kind === "super")?.subs?.[0] ?? "";
  const map: Record<string, string> = { Revenant: "Stasis", Nightstalker: "Void", Gunslinger: "Solar", Arcstrider: "Arc", Threadrunner: "Strand" };
  const cap = (x: number) => Math.min(4, x);
  return {
    g: cap(1 + e("grenade") + lean("grenade")), m: cap(1 + e("melee") + lean("melee")), c: cap(1 + e("classAbility") + lean("class")), s: cap(1 + e("super") + lean("super")),
    heal: goal === "survival" ? 3 : goal === "bossDps" ? 1.5 : 1.5,
    resist: goal === "survival" ? 2.5 : goal === "bossDps" ? 1.5 : 1,
    ammoH: ws.some(w => w!.ammo === 3), ammoS: ws.some(w => w!.ammo === 2),
    elems: ws.map(w => w!.element), superEl: map[superEl] ?? "", goal,
  };
}

// Value of a mod for this build, and the plain-words reason. Orb users only count when the build makes orbs.
function rate(name: string, n: Need, orbs: boolean, v: BuildView): [number, string] {
  const el = ELS.find(x => name.startsWith(x + " "));
  const primaryEl = v.weapons[0]?.element, energyEl = v.weapons[1]?.element, heavyEl = v.weapons[2]?.element;
  const ammo = (w?: { ammo: number }) => w?.ammo ?? 0;
  const s = (x: number) => Math.round(x * 10) / 10;
  switch (name) {
    case "Firepower": return [2.2 * n.g, "your grenade kills make Orbs of Power"];
    case "Heavy Handed": return [2.2 * n.m, "your melee kills make Orbs of Power"];
    case "Reaper": return [1.8 * n.c, "your next kill after a dodge makes an Orb of Power"];
    case "Innervation": return [orbs ? 2 * n.g : 0, "every orb you pick up speeds up your grenade"];
    case "Invigoration": return [orbs ? 2 * n.m : 0, "every orb you pick up speeds up your melee"];
    case "Insulation": return [orbs ? 2 * n.c : 0, "every orb you pick up speeds up your dodge"];
    case "Absolution": return [orbs ? 0.9 * (n.g + n.m + n.c) : 0, "every orb speeds up all your abilities"];
    case "Orbs of Restoration": return [orbs ? 1.6 : 0, "orbs top up whichever ability is lowest"];
    case "Recuperation": return [orbs ? 1.5 * n.heal : 0, "orbs heal you"];
    case "Better Already": return [orbs ? 1.1 * n.heal : 0, "orbs start your health regenerating right away"];
    case "Impact Induction": return [s(0.9 * n.g * Math.min(n.m, 3) / 2), "melee hits refill your grenade"];
    case "Momentum Transfer": return [s(0.9 * n.m * Math.min(n.g, 3) / 2), "grenade hits refill your melee"];
    case "Bolstering Detonation": return [s(0.9 * n.c * Math.min(n.g, 3) / 2), "grenade hits refill your dodge"];
    case "Focusing Strike": return [s(0.9 * n.c * Math.min(n.m, 3) / 2), "melee hits refill your dodge"];
    case "Bomber": return [s(0.9 * n.g * Math.min(n.c, 3) / 2), "every dodge speeds up your grenade"];
    case "Outreach": return [s(0.9 * n.m * Math.min(n.c, 3) / 2), "every dodge speeds up your melee"];
    case "Distribution": return [s(0.6 * (n.g + n.m + n.s) * Math.min(n.c, 3) / 2), "dodging near enemies speeds up all your abilities"];
    case "Dynamo": return [s(0.8 * n.s * Math.min(n.c, 3) / 2), "dodging near enemies charges your super"];
    case "Ashes to Assets": return [s(0.8 * n.s * Math.min(n.g, 3) / 2), "grenade kills charge your super"];
    case "Hands-On": return [s(0.8 * n.s * Math.min(n.m, 3) / 2), "melee kills charge your super"];
    case "Powerful Attraction": return [orbs ? 0.9 : 0, "your dodge pulls in nearby orbs"];
    case "Heavy Ammo Finder": return [n.ammoH ? (n.goal === "bossDps" ? 6 : 2.4) : 0, "more heavy ammo for your heavy weapon"];
    case "Special Ammo Finder": return [n.ammoS ? (n.goal === "bossDps" ? 3.5 : 1.6) : 0, "more special ammo"];
    case "Concussive Dampener": return [1.2 * n.resist, "less damage from explosions"];
    case "Melee Damage Resistance": return [0.9 * n.resist, "less damage from enemies up close"];
    case "Sniper Damage Resistance": return [0.6 * n.resist, "less damage from snipers"];
    case "Harmonic Siphon": return [n.elems.includes(n.superEl) ? 2.6 : 0, `rapid ${n.superEl} weapon kills make orbs (matches your super)`];
    case "Harmonic Scavenger": return [v.weapons.some(w => w && w.ammo > 1 && w.element === n.superEl) ? 1.5 : 0, `more reserves for your ${n.superEl} special and heavy weapons`];
    case "Harmonic Ammo Generation": return [v.weapons.some(w => w && w.ammo > 1 && w.element === n.superEl) ? 1 : 0, "more ammo drops for your matching weapons"];
    case "Harmonic Loader": return [n.elems.includes(n.superEl) ? 0.6 : 0, "faster reloads on matching weapons"];
    case "Harmonic Resistance": return [0.5 * n.resist, "less damage from your super's element"];
  }
  if (el && name.endsWith(" Siphon")) return [el === primaryEl || el === energyEl ? 2.3 : 0, `rapid ${el} weapon kills make Orbs of Power`];
  if (el && name.endsWith(" Scavenger")) return [(el === heavyEl && ammo(v.weapons[2]) === 3) || (el === energyEl && ammo(v.weapons[1]) === 2) || (el === primaryEl && ammo(v.weapons[0]) === 2) ? 1.4 : 0, `more reserves for your ${el} special or heavy weapon`];
  if (el && name.endsWith(" Ammo Generation")) return [(el === energyEl && ammo(v.weapons[1]) === 2) ? 0.9 : 0, `more ammo drops for your ${el} weapon`];
  if (el && name.endsWith(" Loader")) return [el === primaryEl ? 0.6 : 0, `faster reloads on your ${el} primary`];
  if (el && name.endsWith(" Targeting")) return [el === primaryEl ? 0.4 : 0, `better aim on your ${el} primary`];
  if (el && name.endsWith(" Resistance")) return [0.3 * n.resist, `less ${el} damage`];
  return [0, ""];
}

const ORB_MAKERS = new Set(["Firepower", "Heavy Handed", "Reaper"]);
const isSiphon = (n: string) => n.endsWith(" Siphon");

// Every mod you've unlocked, per plug set, gathered from all your items.
export function ownedMods(items: { hash: number; options: Record<number, number[]> }[], defOf: (h: number) => ItemDef | undefined): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const it of items) {
    const sd = defOf(it.hash)?.sockets ?? [];
    for (const [i, list] of Object.entries(it.options)) {
      const ps = sd[Number(i)]?.reusable;
      if (!ps) continue;
      const set = out.get(ps) ?? new Set<number>();
      list.forEach(h => set.add(h));
      out.set(ps, set);
    }
  }
  return out;
}

export function planArmorMods(v: BuildView, defOf: (h: number) => ItemDef | undefined, statMods: Partial<Record<Slot, StatKey>>, owned: Map<number, Set<number>>): PieceMods[] {
  if (!v.armor) return [];
  const n = needs(v);
  const buildOrbs = (v.loops.made.get("orb")?.total ?? 0) > 0.6;
  const out: PieceMods[] = [];
  // Pass 1 picks orb makers and siphons; pass 2 knows whether the build makes orbs.
  let orbs = buildOrbs;
  for (const pass of [1, 2]) {
    out.length = 0;
    let madeOrbs = buildOrbs;
    for (const slot of ARMOR_SLOTS) {
      const p = v.armor.pieces[slot];
      if (!p) continue;
      const cat = `enhancements.v2_${slot === "class" ? "class_item" : slot === "helmet" ? "head" : slot}`;
      const capacity = p.item.energy || (p.legacy ? 10 : 11);
      const stat = statMods[slot];
      const statEnergy = stat ? 3 : 0;
      // Sockets for this slot's mods. Mods unlock account-wide, but Bungie marks most of them locked on vault
      // items, so each socket offers every mod seen unlocked in that plug set on any of your items.
      const sdefs = defOf(p.item.hash)?.sockets ?? [];
      const sockets = sdefs.map((sd, i) => [...new Set([...(p.item.options[i] ?? []), ...(owned.get(sd.reusable) ?? [])])])
        .map(list => list.map(h => ({ h, d: defOf(h) })).filter(x => x.d && x.d.plugCat === cat && x.d.name !== "Empty Mod Socket"));
      const slotSockets = sockets.filter(s => s.length).slice(0, 3);
      const cands = [...new Map(slotSockets.flat().map(x => [x.d!.name, x])).values()]
        .map(x => { const [val, why] = rate(x.d!.name, n, orbs, v); return { name: x.d!.name, hash: x.h, energy: x.d!.energy, val, why }; })
        .filter(c => c.val > 0.05)
        .sort((a, b) => b.val - a.val);
      // Best set of up to three mods that fits the energy left after the stat mod.
      let best: typeof cands = [], bestVal = 0;
      const budget = capacity - statEnergy, k = Math.min(3, slotSockets.length || 3);
      const rec = (i: number, cur: typeof cands, used: number, val: number) => {
        if (val > bestVal) { bestVal = val; best = [...cur]; }
        if (cur.length === k) return;
        for (let j = i; j < Math.min(cands.length, 14); j++) {
          const c = cands[j];
          if (used + c.energy > budget) continue;
          if (isSiphon(c.name) && cur.some(x => isSiphon(x.name))) continue;
          cur.push(c); rec(j + 1, cur, used + c.energy, val + c.val); cur.pop();
        }
      };
      rec(0, [], 0, 0);
      const mods = best.map(b => ({ name: b.name, hash: b.hash, energy: b.energy, why: b.why }));
      if (mods.some(m => ORB_MAKERS.has(m.name) || isSiphon(m.name))) madeOrbs = true;
      const used = statEnergy + mods.reduce((t, m) => t + m.energy, 0);
      out.push({ slot, piece: p, statMod: stat ? { stat, energy: 3 } : undefined, mods, used, capacity, open: k - mods.length });
    }
    if (pass === 1) orbs = madeOrbs;
  }
  return out;
}
