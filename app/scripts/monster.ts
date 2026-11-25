import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, specFromBuild, evaluateNow, stepsFrom, pointsByPiece } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { STAT_ORDER, type StatKey } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, defOf, [...defs.values()], hunter.id);
const goal = "abilities" as const;
const found = searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: 8, require: { subclass: "Revenant", aspects: ["Shatterdive"] } }).map(specFromBuild);
const scenarios: [string, any][] = [
  ["Auto (all 50+)", { targets: {}, mw: "asIs" }],
  ["5 at 100+, Health any", { targets: { melee: 100, grenade: 100, super: 100, class: 100, weapons: 100, health: 0 }, mw: "asIs" }],
  ["5 at 100+, Melee any", { targets: { health: 100, grenade: 100, super: 100, class: 100, weapons: 100, melee: 0 }, mw: "asIs" }],
  ["MW: 5 at 100+, Health any", { targets: { melee: 100, grenade: 100, super: 100, class: 100, weapons: 100, health: 0 }, mw: "full" }],
];
const now = evaluateNow(ctx, goal, { targets: {}, mw: "asIs", style: "peaks", tune: true })!;
console.log("NOW:", STAT_ORDER.map(k => now.stats[k]).join("/"), "score", now.score.toFixed(1));
for (const [label, st] of scenarios) {
  const set = { ...st, style: "peaks", tune: true };
  const ranked = found.map(sp => ({ sp, v: evaluate({ ...sp, goal }, ctx, set) })).sort((a, b) => a.v.issues.length - b.v.issues.length || b.v.score - a.v.score);
  console.log(`\n=== ${label}`);
  for (const { sp, v } of ranked.slice(0, 3)) {
    console.log(`score ${v.score.toFixed(1)} (loops ${v.loopScore.toFixed(1)}) | ${STAT_ORDER.map(k => v.stats[k]).join("/")} | ${v.issues.join(" ") || "ok"}`);
    console.log(`   ${sp.super} | ${sp.grenade} | ${sp.melee} | ${sp.classAbility} | ${sp.aspects.join(" + ")} | ${sp.fragments.join(", ")} | ${sp.exotic}`);
    console.log(`   weapons ${v.weapons.map(w => `${w?.item.name} (P${w?.item.power})`).join(" | ")} | artifact ${sp.artifact}: ${(sp.artifactPerks ?? []).join(", ")}`);
    console.log(`   armor ${Object.values(v.armor!.pieces).map(p => p.item.name + (p.mwLevel >= 5 ? "" : "~") + (p.item.owner === "vault" ? "(vault)" : "")).join(", ")} | mods ${v.armor!.mods.join(",")} | tune ${Object.entries(v.armor!.tuning).map(([k, t]) => `${k}:${t!.name}`).join("; ")}`);
    console.log(`   combos ${v.loops.combos.map(c => c.name).join(", ")} | idle ${v.loops.unfed.map(u => u.name).join(", ")}`);
  }
}
