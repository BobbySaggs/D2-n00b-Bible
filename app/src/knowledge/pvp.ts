// Crucible knowledge. Two kinds of input, kept apart on purpose:
//  - FACTS from Bungie: each weapon's own stats (range, handling, stability, aim assist, airborne, reload, fire rate)
//    and the PvP changes listed in Bungie's 9.7.0 patch notes (June 9, 2026). These are labeled "Bungie".
//  - STEEPED'S JUDGMENT: how much each stat matters for each weapon type in a duel. These weights are Steeped's own
//    reasoning, shown as such, never presented as measured facts.

export const WEAPON_STAT = {
  stability: 155624089, handling: 943549884, range: 1240592695, aim: 1345609583, airborne: 2714457168,
  magazine: 3871231066, reload: 4188031367, rpm: 4284893193, impact: 4043523819, zoom: 3555269338,
} as const;
export type WStat = keyof typeof WEAPON_STAT;
export type WeaponStats = Partial<Record<WStat, number>>;
export const WSTAT_LABEL: Record<WStat, string> = {
  stability: "Stability", handling: "Handling", range: "Range", aim: "Aim assist", airborne: "Airborne", magazine: "Magazine",
  reload: "Reload", rpm: "Fire rate", impact: "Impact", zoom: "Zoom",
};

type W = Partial<Record<"range" | "handling" | "stability" | "aim" | "airborne" | "reload", number>>;
// Steeped's judgment: what wins duels with each weapon type (weights add up to 1).
const PRIMARY_GUN: W = { range: 0.3, stability: 0.2, handling: 0.2, aim: 0.15, airborne: 0.1, reload: 0.05 };
const DUEL_WEIGHTS: Record<string, W> = {
  "Hand Cannon": { range: 0.3, aim: 0.2, handling: 0.2, stability: 0.15, airborne: 0.1, reload: 0.05 },
  "Auto Rifle": { range: 0.25, stability: 0.25, handling: 0.2, aim: 0.15, airborne: 0.1, reload: 0.05 },
  "Submachine Gun": { range: 0.3, stability: 0.2, handling: 0.25, aim: 0.1, airborne: 0.1, reload: 0.05 },
  "Pulse Rifle": PRIMARY_GUN, "Scout Rifle": PRIMARY_GUN, "Sidearm": { range: 0.25, handling: 0.3, stability: 0.2, aim: 0.15, airborne: 0.05, reload: 0.05 },
  "Combat Bow": { handling: 0.3, stability: 0.25, aim: 0.25, airborne: 0.1, reload: 0.1 },
  "Shotgun": { range: 0.35, handling: 0.3, aim: 0.1, airborne: 0.15, reload: 0.1 },
  "Sniper Rifle": { handling: 0.35, aim: 0.2, airborne: 0.15, stability: 0.1, reload: 0.2 },
  "Fusion Rifle": { range: 0.35, stability: 0.2, handling: 0.25, aim: 0.1, reload: 0.1 },
  "Glaive": { handling: 0.4, range: 0.3, reload: 0.3 },
  "Trace Rifle": { range: 0.3, stability: 0.3, handling: 0.2, aim: 0.2 },
  "Grenade Launcher": { handling: 0.4, reload: 0.3, stability: 0.3 },
  "Machine Gun": { range: 0.3, stability: 0.3, handling: 0.2, aim: 0.2 },
  "Rocket Launcher": { handling: 0.4, reload: 0.3, stability: 0.3 },
};
// Steeped's judgment: how often a weapon type can win a duel outright. Stats say how well a gun handles; they
// don't say a shotgun or sniper can kill in one shot while a trace rifle can't. Primaries are treated alike.
const LETHALITY: Record<string, number> = {
  "Shotgun": 1, "Sniper Rifle": 1, "Fusion Rifle": 0.9, "Grenade Launcher": 0.7, "Glaive": 0.6, "Trace Rifle": 0.6,
  "Rocket Launcher": 0.9, "Machine Gun": 0.7, "Sword": 0.5,
};

// 0 to 10: how well this weapon's own stats suit duels for its type. Heavy weapons count less in PvP
// (heavy ammo is rare there), which the caller applies by slot.
export function duelRating(type: string, s: WeaponStats): number | undefined {
  const w = DUEL_WEIGHTS[type];
  if (!w) return undefined;
  let t = 0;
  for (const [k, x] of Object.entries(w)) t += (x as number) * Math.min(100, s[k as WStat] ?? 0);
  return Math.round(t * (LETHALITY[type] ?? 1)) / 10;
}

// What the slot is worth in a duel: primary is your main gun, special your finisher, heavy rare in PvP.
export const DUEL_SLOT = { 1: 1, 2: 0.8, 3: 0.25 } as Record<number, number>;

// Facts from Bungie's 9.7.0 patch notes (June 9, 2026) that change how a Hunter piece plays in PvP.
export const PVP_NOTES: Record<string, string> = {
  "Golden Gun: Deadshot": "9.7.0: kills on enemy players refund 40% less super energy.",
  "Stylish Executioner": "9.7.0: invisible Hunters are much easier to see in the Crucible.",
  "Vanishing Step": "9.7.0: invisible Hunters are much easier to see in the Crucible.",
  "Trapper's Ambush": "9.7.0: invisible Hunters are much easier to see in the Crucible.",
  "Gambler's Dodge": "9.7.0: abilities with more than one charge start Crucible matches with one charge.",
  "Marksman's Dodge": "9.7.0: abilities with more than one charge start Crucible matches with one charge.",
};

export const MODE_NOTES = {
  crucible: "Quickplay, Control and Iron Banner: your artifact perks are active.",
  trials: "Trials of Osiris and Competitive: artifacts are switched off (Bungie, 9.7.0), so Steeped builds without them.",
};

// Stats past 100 in PvP (shatteredvault Armor 3.0 notes): Weapons adds only 0-6% damage vs players, the Class
// overshield is 0-10 HP instead of 0-40, extra shield capacity from Health is PvE only. Grenade, Melee and Super
// damage past 100 have no confirmed PvP value. So past 100 is worth much less in PvP, except Health's faster recharge.
export const PVP_PAST_100: Record<string, number> = { health: 0.8, melee: 0.3, grenade: 0.3, super: 0.3, class: 0.3, weapons: 0.35 };
