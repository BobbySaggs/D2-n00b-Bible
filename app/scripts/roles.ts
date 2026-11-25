import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, specFromBuild, evaluateNow } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, defOf, [...defs.values()], hunter.id);
const set = { targets: {}, mw: "asIs", style: "peaks", tune: true } as any;
for (const goal of ["abilities", "bossDps", "survival", "team", "whole"] as any[]) {
  const now = evaluateNow(ctx, goal, set)!;
  const best = searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: 3 }).map(specFromBuild)
    .map(sp => evaluate({ ...sp, goal }, ctx, set)).sort((a, b) => b.score - a.score)[0];
  console.log(goal, "now", now.score.toFixed(1), "best", best.score.toFixed(1), "rating", Math.round(100 * now.score / best.score), "| best:", best.spec.subclass, best.spec.super, best.spec.exotic);
}
