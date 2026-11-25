import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, specFromBuild, stepsFrom, evaluateNow } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, defOf, [...defs.values()], hunter.id);
const goal = "bossDps" as any;
const best = (n: string) => inv.items.filter(i => i.name === n).sort((a, b) => b.power - a.power)[0];
const pinned = [best("Still Hunt").id, best("Apex Predator").id];
console.log("Apex", best("Apex Predator").power, best("Apex Predator").gearTier, "Still Hunt", best("Still Hunt").power);
const require = { subclass: "Prismatic Hunter", super: "Golden Gun: Marksman", exotic: "Celestial Nighthawk", aspects: ["Winter's Shroud", "Stylish Executioner"] };
const found = searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: 3, require, pinnedWeapons: pinned }).map(specFromBuild);
const now = evaluateNow(ctx, goal, { targets: {}, mw: "asIs", style: "peaks", tune: true })!;
for (const [label, set] of [
  ["As the guide (stats auto)", { targets: {}, mw: "asIs", style: "peaks", tune: true }],
  ["Tuned: Super + Weapons 100+", { targets: { super: 100, weapons: 100 }, mw: "asIs", style: "peaks", tune: true }],
  ["Tuned + masterworks", { targets: { super: 100, weapons: 100, class: 100 }, mw: "full", style: "peaks", tune: true }],
] as [string, any][]) {
  const sp = found[0];
  const v = evaluate({ ...sp, goal }, ctx, set);
  console.log(`\n== ${label}: score ${v.score.toFixed(1)} | ${STAT_ORDER.map(k => v.stats[k]).join("/")} | ${v.issues.join(" ")}`);
  console.log(`   ${sp.grenade} | ${sp.melee} | ${sp.classAbility} | frags ${sp.fragments.join(", ")}`);
  console.log(`   weapons ${v.weapons.map((w: any) => `${w?.item.name} T${w?.tier}${w?.infuse ? " INFUSE" : ""}`).join(" | ")} | ${sp.artifact}: ${(sp.artifactPerks ?? []).join(", ")}`);
  console.log(`   armor ${Object.values(v.armor!.pieces).map((p: any) => p.item.name + (p.mwLevel >= 5 ? "" : "~")).join(", ")} | mods ${v.armor!.mods.join(",")}`);
  console.log(`   combos ${v.loops.combos.map((c: any) => c.name).join(", ")}`);
}
console.log("\nYour current build on boss:", now.score.toFixed(1));
