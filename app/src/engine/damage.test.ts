import { describe, expect, it } from "vitest";
import { DAMAGE, damageOf, knowPerks, rowsFor } from "./damage";

describe("boss damage table", () => {
  knowPerks(DAMAGE.rows.flatMap(r => r.perks).filter(p => !/Argent|Pack Hunter|Guidance|Moebius|simulated|Turncoat|Sentinel/.test(p)));
  it("matches legendary frames by type and ammo", () => {
    const rows = rowsFor({ name: "Any Rocket", exotic: false, frame: "Aggressive Frame", type: "Rocket Launcher", ammo: 3, perks: [] });
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every(r => r.type === "Rocket Launcher" && r.ammo === 3)).toBe(true);
  });
  it("matches exotics by name", () => {
    expect(rowsFor({ name: "Leviathan's Breath", exotic: true, frame: "", type: "Combat Bow", ammo: 3, perks: [] }).length).toBeGreaterThan(0);
  });
  it("gives the tested roll full credit and a missing-perk roll less", () => {
    const g = { name: "x", exotic: false, frame: "Aggressive Frame", type: "Rocket Launcher", ammo: 3 };
    const full = damageOf({ ...g, perks: ["Cluster Bomb", "Elemental Honing", "Timelost Magazine", "Shoot to Loot"] })!;
    const none = damageOf({ ...g, perks: ["Field Prep", "Impulse Amplifier"] })!;
    expect(full.exact).toBe(true);
    expect(full.dps).toBeGreaterThan(none.dps);
    expect(none.missing.length).toBeGreaterThan(0);
  });
  it("knows nothing about guns the sheet never tested", () => {
    expect(damageOf({ name: "x", exotic: false, frame: "Adaptive Frame", type: "Hand Cannon", ammo: 1, perks: [] })).toBeNull();
  });
});
