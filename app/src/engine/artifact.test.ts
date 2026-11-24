import { describe, expect, it } from "vitest";
import { byName, type K } from "../knowledge/hunter";
import { perkKnowledge } from "../knowledge/artifact";
import { bestArtifact, fitArtifact, type ArtifactChoice } from "./artifact";
import type { Item } from "../model/inventory";
import type { Part } from "./loops";

// Two artifacts with three sockets each, built from the real perk rules (by name, as Bungie sends them).
let h = 1;
const perk = (name: string) => perkKnowledge(h++, name, "");
const art = (name: string, cols: string[][], equipped = false): ArtifactChoice => ({
  item: { name, kind: "artifact", equipped } as Item, name, equipped,
  sockets: cols.map((c, index) => ({ index, options: c.map(perk), current: undefined })),
});
const part = (n: string): Part => ({ k: byName.get(n)! });
const marker = (name: string): Part => ({ k: { name, kind: "weapon", makes: [], uses: [], says: "" } as K });

describe("artifact rules (audited Nov 24)", () => {
  it("Strand Soldier needs Woven Mail and makes Unraveling Rounds", () => {
    const k = byName.get("Strand Soldier")!;
    expect(k.uses).toContain("woven");
    expect(k.makes).toContain("unravel");
    expect(k.makes).not.toContain("woven");
  });
  it("Prismatic Transfer only helps teammates", () => {
    expect(byName.get("Prismatic Transfer")!.makes).toEqual(["teamBuff"]);
  });
  it("every rule-backed perk reads as checked, not guessed", () => {
    for (const n of ["Volatile Flow", "Wind Chill", "Supernova", "Singularity Blade"]) expect(perk(n).read).toBe("checked");
  });
});

describe("picking an artifact for a build", () => {
  const NPA = art("NPA Repulsion Regulator", [["Volatile Flow", "Amped Up"], ["Protective Breach", "Improved Unraveling"], ["Unto the Breach", "Strand Soldier"]], true);
  const SLAYER = art("Slayer Baron Apothecary Satchel", [["Wind Chill", "Arc Compounding"], ["Hail The Storm", "Killing Breeze"], ["Frost Renewal", "Brain Freeze"]]);

  it("a Void build with a Void gun gets the Void Breach loop", () => {
    const base = [part("Shatter Orbs"), marker("__sub:Void"), marker("__el:Void")];
    const fit = fitArtifact(base, "whole", NPA);
    expect(fit.perks.map(p => p.perk.name)).toEqual(expect.arrayContaining(["Volatile Flow", "Unto the Breach", "Protective Breach"]));
  });
  it("a Stasis build with a Stasis gun picks the Stasis artifact over the Void one", () => {
    const base = [marker("__sub:Stasis"), marker("__el:Stasis"), part("Whisper of Chains")];
    expect(bestArtifact(base, "whole", [NPA, SLAYER])?.artifact.name).toBe("Slayer Baron Apothecary Satchel");
  });
  it("never picks the same perk twice", () => {
    const dup = art("Dup", [["Volatile Flow", "Amped Up"], ["Volatile Flow", "Amped Up"]]);
    const names = fitArtifact([marker("__sub:Void"), marker("__el:Void")], "whole", dup).perks.map(p => p.perk.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
