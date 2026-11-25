import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, specFromBuild, fullModPlan, stepsFrom, modSteps, evaluateNow } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const set = { healthFloor: 50, mw: "asIs" as const, style: "peaks" as const };
for (const goal of ["abilities", "bossDps"] as const) {
  const b = searchBuilds({ inv, defOf: ctx.defOf, defs: ctx.defs, characterId: hunter.id, goal, top: 1, require: { aspects: ["Shatterdive"], grenade: "Glacier Grenade" } })[0];
  const v = evaluate(specFromBuild(b), ctx, set);
  console.log(`\n== ${goal}: ${v.spec.subclass} + ${v.spec.exotic} | ${v.spec.super}, ${v.spec.grenade}, ${v.spec.melee}, ${v.spec.classAbility} | aspects ${v.spec.aspects} | frags ${v.spec.fragments}`);
  console.log("  weapons", v.weapons.map(w => w?.item.name).join(", "), "| stats", STAT_ORDER.map(k => v.stats[k]).join("/"));
  console.log("  grenade loop:", v.loops.energy.find(e => e.kind === "grenade")?.refills.join(", "));
  for (const pm of fullModPlan(v, ctx)) console.log("  ", pm.slot, pm.piece.item.name, "|", pm.mods.map(m => m.name).join(", "));
  const now = evaluateNow(ctx, goal, set)!; console.log("  steps:", [...stepsFrom(now, v, ctx), ...modSteps(v, ctx)].length);
}
