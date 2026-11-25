import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, tuneCurrent } from "../src/engine/evaluate";
import { STAT_ORDER } from "../src/bungie/config";
import { count100 } from "../src/engine/solve";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const base = { ...tuneCurrent(ctx, "whole")!, exotic: "Star-Eater Scales", armorLocks: {} };
for (const hf of [50, 70, 100]) for (const style of ["peaks", "even"] as const) {
  const v = evaluate(base, ctx, { healthFloor: hf, mw: "asIs", style });
  console.log(`health>=${hf} ${style}: ${STAT_ORDER.map(k => `${k.slice(0,3)} ${v.stats[k]}`).join(" ")} | 100+: ${count100(v.stats)} | score ${v.score.toFixed(1)} | armor ${Object.values(v.armor!.pieces).map(p => p.item.name).join(", ")}`);
}
