import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, specFromBuild } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, defOf, [...defs.values()], hunter.id);
const goal = "bossDps" as any;
const set = { targets: {}, mw: "asIs", style: "peaks", tune: true } as any;
const found = searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: 6 }).map(specFromBuild);
for (const sp of found) {
  const v = evaluate({ ...sp, goal }, ctx, set);
  console.log(`\nscore ${v.score.toFixed(1)} loops ${v.loopScore.toFixed(1)} | ${STAT_ORDER.map(k => v.stats[k]).join("/")} | ${v.issues.join(" ")}`);
  console.log(`  ${sp.subclass} | ${sp.super} | ${sp.grenade} | ${sp.melee} | ${sp.classAbility} | ${sp.aspects.join(" + ")} | ${sp.exotic}`);
  console.log(`  weapons ${v.weapons.map((w: any) => `${w?.item.name} [${w?.type}]`).join(" | ")} | ${sp.artifact}`);
  console.log(`  combos ${v.loops.combos.map((c: any) => c.name).join(", ")} | bossDmg ${(v.loops.made.get("bossDmg")?.total ?? 0).toFixed(1)} by ${(v.loops.made.get("bossDmg")?.by ?? []).join(", ")}`);
}
