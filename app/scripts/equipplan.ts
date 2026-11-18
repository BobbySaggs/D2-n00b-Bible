import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, tuneCurrent, specFromBuild } from "../src/engine/evaluate";
import { equipPlan } from "../src/engine/equip";
import { searchBuilds } from "../src/engine/builds";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const set = { healthFloor: 50, mw: "asIs" as const, style: "peaks" as const };
for (const [n, spec] of [["A tuned", tuneCurrent(ctx, "abilities")!], ["B best raid", specFromBuild(searchBuilds({ inv, defOf: ctx.defOf, defs: ctx.defs, characterId: hunter.id, goal: "bossDps", top: 1 })[0])]] as const) {
  const v = evaluate(spec, ctx, set);
  console.log(`\n== ${n}: ${v.spec.subclass} + ${v.spec.exotic}`);
  for (const st of equipPlan(v, ctx)) console.log(" ", st.kind.padEnd(6), st.label, st.kind === "plug" ? `[socket ${st.socket} -> ${st.hash}]` : st.kind === "manual" ? `!! ${st.why}` : "");
}
