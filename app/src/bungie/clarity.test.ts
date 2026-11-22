import { describe, expect, it } from "vitest";
import { parseClarity } from "./clarity";

// Made-up entries in Clarity's file shape (no real Clarity data in the repo).
const raw = {
  "1": { hash: 1, name: "Test Buff", type: "Weapon Trait", descriptions: { en: "Kills grant <:solar:1>a buff.\n• 10%|20%|30% increased damage at 1|2|3 Stacks" } },
  "2": { hash: 2, name: "Test Shield", type: "Armor Trait Exotic", descriptions: { en: "While active, gain 🡅25% damage resistance. Kills grant 15% Grenade Ability Energy." } },
  "3": { hash: 3, name: "No text", descriptions: {} },
};

describe("parseClarity", () => {
  it("reads damage, resistance and energy numbers from the text", () => {
    const [a, b] = parseClarity(raw);
    expect(a.dmgPct).toBe(30);
    expect(a.text).not.toContain("<:solar");
    expect(b.drPct).toBe(25);
    expect(b.energy.gEn).toBe(15);
  });
  it("skips entries without English text", () => {
    expect(parseClarity(raw)).toHaveLength(2);
  });
});
