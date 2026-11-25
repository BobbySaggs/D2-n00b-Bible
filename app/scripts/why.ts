import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, evaluateNow, tuneCurrent, statScore } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { specFromBuild } from "../src/engine/evaluate";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const st = { healthFloor: Number(process.argv[3] ?? 50), mw: "asIs" as const, style: "peaks" as const };
const goal = "whole";
const best = specFromBuild(searchBuilds({ inv, defOf: h => defs.get(h), defs: [...defs.values()], characterId: hunter.id, goal, top: 1 })[0]);
const show = (label: string, v: any) => {
  console.log(`\n== ${label}: ${v.spec.subclass} + ${v.spec.exotic} | total ${v.score.toFixed(1)} = loops ${v.loopScore.toFixed(1)} + stats ${v.statScore.toFixed(1)}`);
  console.log("   stats", STAT_ORDER.map(k => `${k.slice(0,3)} ${v.stats[k]}`).join(" "));
  console.log("   weapons", v.weapons.map((w: any) => w?.item.name).join(" | "), "| frags", v.spec.fragments.join(", "));
  console.log("   combos", v.loops.combos.map((c: any) => c.name).join(", "));
  const made = [...v.loops.made.entries()].sort((a: any, b: any) => b[1].total - a[1].total).map(([t, m]: any) => `${t}:${m.total.toFixed(1)}`).join(" ");
  console.log("   made", made);
};
const now = evaluateNow(ctx, goal, st)!; show("NOW", now);
const a = evaluate(tuneCurrent(ctx, goal)!, ctx, st); show("A", a);
const b = evaluate(best, ctx, st); show("BEST", b);
// leave-one-out on best and A: what each piece contributes to the loop score
for (const [lab, v] of [["A", a], ["BEST", b]] as const) {
  const sp = v.spec; const out: string[] = [];
  const base = v.loopScore;
  const tryDrop = (name: string, mod: any) => { const w = evaluate({ ...sp, ...mod }, ctx, st); out.push(`${name} ${(base - w.loopScore).toFixed(1)}`); };
  tryDrop("exotic:" + sp.exotic, { exotic: "" });
  sp.weapons.forEach((id, i) => tryDrop("weapon:" + ctx.weapons.find(w => w.item.id === id)?.item.name, { weapons: sp.weapons.map((x, j) => j === i ? "" : x) }));
  tryDrop("artifact perks", { artifactPerks: [] });
  console.log(`\n${lab} loop points by piece (drop it, loops lose):`, out.join(" | "));
}
import { pointsByPiece } from "../src/engine/evaluate";
for (const [lab, v] of [["NOW", now], ["BEST", b]] as const) console.log(`\n${lab} points:`, pointsByPiece(v).map(p => `${p.name} ${p.points.toFixed(1)}`).join(" | "));
