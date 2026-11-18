import { describe, expect, it } from "vitest";
import profile from "../../fixtures/profile.json";
import rawDefs from "../../fixtures/defs.json";
import { trim, type ItemDef } from "../bungie/defs";
import { buildInventory, itemHashes, plugHashes, plugSetHashes } from "./inventory";
import { summarize } from "./summary";

const defs = new Map<number, ItemDef>(Object.entries(rawDefs).map(([h, d]) => [Number(h), trim(d, Number(h))]));
const inv = buildInventory(profile, h => defs.get(h), { name: "Tester#1234", membershipType: 3, membershipId: "4611" });

describe("buildInventory", () => {
  it("reads characters, most recent first, with character-screen stats", () => {
    expect(inv.characters.map(c => c.cls)).toEqual(["Hunter", "Titan"]);
    expect(inv.characters[0].stats).toEqual({ health: 60, melee: 45, grenade: 110, super: 70, class: 102, weapons: 101 });
    expect(inv.characters[0].light).toBe(550);
  });

  it("keeps armor, weapons and subclasses from characters and the vault, drops engrams", () => {
    expect(inv.items.filter(i => i.owner === "vault").map(i => i.name).sort()).toEqual(["Calus Mini-Tool", "Gyrfalcon's Hauberk", "Wildwood Mask"]);
    expect(inv.items.some(i => i.name === "Engram")).toBe(false);
    expect(inv.items.filter(i => i.kind === "subclass")).toHaveLength(2);
  });

  it("reads armor stats, tier, energy and plugs", () => {
    const legs = inv.items.find(i => i.name === "Star-Eater Scales")!;
    expect(legs).toMatchObject({ exotic: true, equipped: true, cls: "Hunter", slot: "legs", gearTier: 5, energy: 11 });
    expect(legs.stats).toMatchObject({ health: 30, grenade: 25, super: 20, melee: 0 });
    const sub = inv.items.find(i => i.name === "Prismatic Hunter")!;
    expect(sub.plugs).toEqual([4001, 4002, 0]);
    expect(sub.reusable[2]).toEqual([4002, 4003]);
  });

  it("offers only unlocked subclass options, but loads names for every option (Bungie's lock flags are unreliable)", () => {
    const sub = inv.items.find(i => i.name === "Prismatic Hunter")!;
    expect(sub.options[2]).toEqual([4003, 4005]);
    expect(plugSetHashes(profile, h => defs.get(h)).sort()).toEqual([4003, 4005, 4006]);
  });

  it("collects every hash it needs definitions for", () => {
    expect(itemHashes(profile)).toContain(1006);
    expect(plugHashes(profile)).toEqual(expect.arrayContaining([4001, 4002, 4003]));
  });
});

describe("summarize", () => {
  const s = summarize(inv);
  it("summarizes per class", () => {
    const h = s.classes.find(c => c.cls === "Hunter")!;
    expect(h).toMatchObject({ subclass: "Prismatic Hunter", wornExotic: "Star-Eater Scales", armor: 7, tier5: 6 });
    expect(h.exotics).toEqual(["Gyrfalcon's Hauberk", "Star-Eater Scales"]);
    expect(h.wornWeapons).toEqual(["Ace of Spades", "Sunshot", "Gjallarhorn"]);
  });
  it("counts weapons and vault", () => {
    expect(s.weapons).toBe(4);
    expect(s.exoticWeapons).toEqual(["Ace of Spades", "Gjallarhorn", "Sunshot"]);
    expect(s.vault).toBe(4);
  });
});
