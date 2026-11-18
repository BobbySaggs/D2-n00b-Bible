import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, evaluateNow, tuneCurrent, specFromBuild } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const set = { healthFloor: 60, mw: "asIs" as const };
const tot = (x: Record<string, number>) => STAT_ORDER.reduce((t, k) => t + x[k], 0);
const show = (n: string, v: ReturnType<typeof evaluate>) => console.log(n.padEnd(8), "score", v.score.toFixed(0), "loops", v.loopScore.toFixed(0), "stats", v.statScore.toFixed(0), "|", STAT_ORDER.map(k => v.stats[k]).join("/"), "total", tot(v.stats), "| frags", v.spec.fragments.join(", "), "| armor", Object.values(v.armor?.pieces ?? {}).map(p => p.item.name).join(", "), "| mods", v.armor?.mods.join(","));
for (const goal of ["abilities", "bossDps", "survival"] as const) {
  console.log("\n==", goal);
  show("Now", evaluateNow(ctx, goal, set)!);
  show("Tuned", evaluate(tuneCurrent(ctx, goal)!, ctx, set));
  const b = searchBuilds({ inv, defOf: ctx.defOf, defs: ctx.defs, characterId: hunter.id, goal, top: 1 });
  const v = evaluate(specFromBuild(b[0]), ctx, set); console.log("best", v.spec.subclass, v.spec.exotic); show("Best", v);
}
