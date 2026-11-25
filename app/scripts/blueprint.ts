// Usage: blueprint.ts snapshot.json.gz [goal] [subclass] [--sim]
// --sim: pretend some owned exotics are missing and feed them back as the catalog (tests the pipeline offline).
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, specFromBuild } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { withCatalog, isStandIn } from "../src/engine/catalog";
import { STAT_ORDER } from "../src/bungie/config";
const [file, goalArg, subArg] = process.argv.slice(2).filter(a => !a.startsWith("--"));
const sim = process.argv.includes("--sim");
const s = JSON.parse(gunzipSync(readFileSync(file)).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
let inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
let catalog = s.catalog ?? [];
if (sim) {
  const drop = ["Star-Eater Scales", "Monte Carlo", "Still Hunt"];
  catalog = [...new Set(inv.items.filter(i => drop.includes(i.name)).map(i => i.hash))].map(h => ({ hash: h, collectible: 0, source: "Simulated: Exotic engram", acquired: false }));
  inv = { ...inv, items: inv.items.filter(i => !drop.includes(i.name)) };
}
const goal = (goalArg ?? "abilities") as any;
const set = { targets: {}, mw: "full", style: "peaks", tune: true } as any;
function best(label: string, I: typeof inv, require: any) {
  const ctx = makeCtx(I, defOf, [...defs.values()], hunter.id);
  const found = searchBuilds({ inv: I, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: 5, require }).map(specFromBuild);
  const r = found.map(sp => ({ sp, v: evaluate({ ...sp, goal }, ctx, set) })).sort((a, b) => a.v.issues.length - b.v.issues.length || b.v.score - a.v.score)[0];
  if (!r) { console.log(label, "none"); return; }
  const { sp, v } = r;
  const missing = [...v.weapons.filter(Boolean).map((w: any) => w.item), ...Object.values(v.armor?.pieces ?? {}).map((p: any) => p.item)].filter(isStandIn).map((i: any) => i.name);
  console.log(`\n== ${label}: score ${v.score.toFixed(1)} (loops ${v.loopScore.toFixed(1)}, stats ${v.statScore.toFixed(1)}) | ${STAT_ORDER.map(k => v.stats[k]).join("/")}`);
  console.log(`   ${sp.subclass} | ${sp.super} | ${sp.grenade} | ${sp.melee} | ${sp.classAbility} | ${sp.aspects.join(" + ")} | ${sp.exotic}`);
  console.log(`   weapons ${v.weapons.map((w: any) => `${w?.item.name}${isStandIn(w?.item ?? { owner: "" }) ? " (NEED)" : ""}`).join(" | ")} | artifact ${sp.artifact}`);
  console.log(`   combos ${v.loops.combos.map((c: any) => c.name).join(", ")}`);
  console.log(`   missing: ${missing.join(", ") || "nothing"}`);
}
console.log("catalog entries:", catalog.length);
best("Best you own", inv, {});
if (subArg) best(`Best you own as ${subArg}`, inv, process.env.ASPECT ? { subclass: subArg, aspects: [process.env.ASPECT] } : { subclass: subArg });
const wc = withCatalog(inv, defOf, catalog, hunter.id);
console.log("stand-ins:", wc.standIns.length);
best("Best possible", wc.inv, process.env.ASPECT ? { subclass: subArg, aspects: [process.env.ASPECT] } : {});
