import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluateNow } from "../src/engine/evaluate";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
for (const [g, t] of [["whole", {}], ["whole", { melee: 100, grenade: 100, super: 100, class: 100, weapons: 100, health: 0 }], ["whole", { melee: 100, grenade: 100, super: 100, weapons: 100 }]] as any[]) {
  const v = evaluateNow(ctx, g, { targets: t, mw: "asIs", style: "peaks", tune: true })!; console.log(JSON.stringify(t), "stats", JSON.stringify(v.stats));
  console.log(g, "score", v.score.toFixed(1), "loops", v.loopScore.toFixed(1), "stats", v.statScore.toFixed(1), "| survives:", v.loops.survives, "| issues:", v.issues);
  console.log("  ", v.spec.subclass, v.spec.aspects, v.spec.exotic, v.weapons.map(w => w?.item.name));
}
