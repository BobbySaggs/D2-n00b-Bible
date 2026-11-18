import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, tuneCurrent, evaluate } from "../src/engine/evaluate";
import { solve, count100, lowest, type StatPlan } from "../src/engine/solve";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const spec = tuneCurrent(ctx, "abilities")!;
const v = evaluate(spec, ctx, { healthFloor: 60, mw: "asIs" });
console.log("tuned frags", spec.fragments, "bonus", v.bonus);
// Exhaustive-ish: for each floor, maximize count of stats >= 100 then total
for (const mw of ["asIs", "full"] as const) for (const floor of [50, 40, 30]) {
  let best: any = null;
  // try weighting combinations: push 3 or 4 chosen stats strongly
  const keys = STAT_ORDER;
  const combos: string[][] = [];
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) { combos.push([keys[a], keys[b], keys[c]]); for (let d = c + 1; d < 6; d++) combos.push([keys[a], keys[b], keys[c], keys[d]]); }
  for (const push of combos) {
    const plan = Object.fromEntries(keys.map(k => [k, push.includes(k) ? { floor: 100, low: 1, high: 0.2 } : { floor, low: 0.6, high: 0.1 }])) as StatPlan;
    const r = solve(ctx.pieces, { cls: "Hunter", exotic: "Fr0st-EE5", plan, bonus: v.bonus, mw, wornIds: ctx.wornIds, minPower: ctx.light - 60, top: 1 })[0];
    if (!r) continue;
    const ok = lowest(r.stats) >= floor;
    if (!ok) continue;
    const key = count100(r.stats) * 10000 + STAT_ORDER.reduce((t, k) => t + r.stats[k], 0);
    if (!best || key > best.key) best = { key, r, push };
  }
  if (best) console.log(mw, "floor", floor, "=>", count100(best.r.stats), "at 100+:", STAT_ORDER.map(k => `${k} ${best.r.stats[k]}`).join(", "), "| mods", best.r.mods.join(","), "| armor", Object.values(best.r.pieces).map((p: any) => p.item.name).join(", "));
}
