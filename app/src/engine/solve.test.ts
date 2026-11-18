import { describe, expect, it } from "vitest";
import { STAT_HASH, type Slot } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import { zeroStats, type Item, type Stats } from "../model/inventory";
import { pieceStats, readPiece } from "./armor";
import { count100, placeMods, solve, statValue, type StatPlan } from "./solve";

// Plug definitions shaped like Bungie's (values from Tyler's real Luminopotent Mask, Nov 18 2026).
const D: Record<number, Partial<ItemDef>> = {
  1: { plugCat: "armor_stats", stats: [[STAT_HASH.melee, 30, 0]] },
  2: { plugCat: "armor_stats", stats: [[STAT_HASH.health, 25, 0]] },
  3: { plugCat: "armor_stats", stats: [[STAT_HASH.super, 20, 0]] },
  4: { plugCat: "armor_archetypes", name: "Brawler", stats: [] },
  5: { plugCat: "core.gear_systems.armor_tiering.plugs.tuning.mods", stats: Object.values(STAT_HASH).map(h => [h, 1, 0]) },
  6: { plugCat: "enhancements.v2_general", stats: [[STAT_HASH.health, 10, 0]] },
  7: { plugCat: "v460.plugs.armor.masterworks", stats: [...Object.values(STAT_HASH).map(h => [h, 5, 0] as [number, number, number]), [3779394102, 11, 0]] },
  8: { plugCat: "v460.plugs.armor.masterworks", stats: [] },
};
const defOf = (h: number) => (D[h] ? ({ name: "", ...D[h] } as ItemDef) : undefined);

let nextId = 1;
function armor(slot: Slot, stats: Partial<Stats>, extra: Partial<Item> = {}): Item {
  // A Tier 5 piece built from plain numbers: three stat plugs, balanced tuning, no mod, not masterworked.
  const plugs: number[] = [];
  const base = { ...zeroStats(), ...stats };
  const statPlug = Object.entries(base).filter(([, v]) => v > 0).map(([k, v]) => {
    const h = 1000 + nextId * 10 + Object.keys(STAT_HASH).indexOf(k);
    D[h] = { plugCat: "armor_stats", stats: [[STAT_HASH[k as keyof typeof STAT_HASH], v, 0]] };
    return h;
  });
  plugs.push(...statPlug, 5, 8);
  return {
    id: String(nextId++), hash: 1, name: `${slot} piece`, slot, kind: "armor", cls: "Hunter", exotic: false, owner: "vault",
    equipped: false, power: 450, damage: "", locked: false, masterworked: false, gearTier: 5, energy: 11,
    stats: zeroStats(), plugs, reusable: {}, options: {}, ...extra,
  };
}

describe("armor model", () => {
  it("reproduces the game's numbers for a masterworked, tuned, modded Tier 5 piece", () => {
    const mask = armor("helmet", {}, { plugs: [1, 2, 3, 4, 5, 6, 7], masterworked: true });
    const p = readPiece(mask, defOf)!;
    expect(p.archetype).toBe("Brawler");
    expect(p.mwLevel).toBe(5);
    expect(p.base).toMatchObject({ melee: 30, health: 25, super: 20, grenade: 0 });
    const s = pieceStats(p, "asIs");
    // In game: Health 35 (with +10 mod), Melee 30, Super 20, Grenade / Class / Weapons 6.
    expect({ ...s, health: s.health + p.mod.health }).toEqual({ health: 35, melee: 30, grenade: 6, super: 20, class: 6, weapons: 6 });
  });

  it("adds the masterwork only when asked, and only to the three stats the piece didn't roll", () => {
    const p = readPiece(armor("arms", { weapons: 30, super: 25, grenade: 20 }), defOf)!;
    expect(pieceStats(p, "asIs")).toMatchObject({ weapons: 30, super: 25, grenade: 20, health: 1, melee: 1, class: 1 });
    expect(pieceStats(p, "full")).toMatchObject({ weapons: 30, health: 6, melee: 6, class: 6 });
  });
});

const flat = (floor: number, low = 1, high = 0.3) =>
  ({ health: { floor, low, high }, melee: { floor, low, high }, grenade: { floor, low, high }, super: { floor, low, high }, class: { floor, low, high }, weapons: { floor, low, high } }) as StatPlan;

describe("solver", () => {
  it("values points under 100 more than points over it, and punishes stats under the floor", () => {
    const w = { floor: 50, low: 1, high: 0.3 };
    expect(statValue(100, w) - statValue(90, w)).toBeGreaterThan(statValue(110, w) - statValue(100, w));
    expect(statValue(40, w)).toBeLessThan(statValue(50, w) - 10);
  });

  it("puts stat mods where they help most: first the floors, then the build's priority", () => {
    const plan = { ...flat(50), grenade: { floor: 50, low: 2, high: 1.5 } };
    const { stats, mods } = placeMods({ health: 40, melee: 60, grenade: 95, super: 60, class: 60, weapons: 60 }, plan, 3);
    expect(mods[0]).toBe("health");
    expect(mods.filter(m => m === "grenade").length).toBe(2);
    expect(stats.grenade).toBe(115);
  });

  it("keeps a low stat above its floor instead of dumping it", () => {
    const pieces = [
      armor("helmet", { grenade: 30, super: 25, weapons: 20 }), armor("helmet", { melee: 30, health: 25, class: 20 }),
      armor("arms", { grenade: 30, super: 25, weapons: 20 }), armor("arms", { class: 30, melee: 25, health: 20 }),
      armor("chest", { grenade: 30, super: 25, weapons: 20 }), armor("chest", { health: 30, class: 25, melee: 20 }),
      armor("legs", { grenade: 30, super: 25, weapons: 20 }), armor("legs", { melee: 30, class: 25, health: 20 }),
      armor("class", { grenade: 30, super: 25, weapons: 20 }), armor("class", { class: 30, health: 25, melee: 20 }),
    ].map(i => readPiece(i, defOf)!);
    const greedy = { ...flat(0, 0.1, 0), grenade: { floor: 0, low: 3, high: 2 } };
    const floored = { ...flat(50, 0.1, 0), grenade: { floor: 0, low: 3, high: 2 } };
    const all = solve(pieces, { cls: "Hunter", plan: greedy, bonus: zeroStats(), mw: "asIs" })[0];
    expect(all.stats.melee).toBeLessThan(20);
    const safe = solve(pieces, { cls: "Hunter", plan: floored, bonus: zeroStats(), mw: "asIs" })[0];
    expect(Math.min(safe.stats.melee, safe.stats.health, safe.stats.class)).toBeGreaterThanOrEqual(45);
    expect(count100(safe.stats)).toBeGreaterThanOrEqual(1);
  });

  it("with Most 100s, spends two mods to carry a stat across 100 instead of spreading them", () => {
    const peak = { floor: 50, low: 0.6, high: 0.25, peak: 1 };
    const plan = { health: peak, melee: peak, grenade: peak, super: peak, class: peak, weapons: peak } as StatPlan;
    const raw = { health: 82, melee: 60, grenade: 60, super: 60, class: 60, weapons: 60 };
    const greedy = placeMods(raw, plan, 2);
    const exact = placeMods(raw, plan, 2, true);
    expect(exact.stats.health).toBe(102);
    expect(count100(exact.stats)).toBeGreaterThanOrEqual(count100(greedy.stats));
  });
});
