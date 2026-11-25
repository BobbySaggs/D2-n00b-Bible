import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { maxHunter } from "../src/engine/maxhunter";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const m = maxHunter(inv, defOf, [...defs.values()], hunter.id, s.catalog ?? [], x => console.error(x));
console.log(`MAX HUNTER ${m.pct.toFixed(1)}% | power ${m.pillars.power.toFixed(1)} gear ${m.pillars.gear.toFixed(1)} builds ${m.pillars.builds.toFixed(1)} | P ${m.power.toFixed(1)} lowest ${m.lowestSlot?.slot} ${m.lowestSlot?.power}`);
for (const k of m.kit) { const v = k.view, sp = v.spec;
  console.log(`\n[${k.role}] score ${v.score.toFixed(1)} | ${STAT_ORDER.map(x => v.stats[x]).join("/")} | issues: ${v.issues.join(" ")}`);
  console.log(`  ${sp.subclass} | ${sp.super} | ${sp.grenade} | ${sp.melee} | ${sp.classAbility} | ${sp.aspects.join(" + ")} | ${sp.exotic} | frags ${sp.fragments.join(", ")}`);
  console.log(`  weapons ${v.weapons.map((w: any) => `${w?.item.name} T${w?.tier}${w?.infuse ? " (infuse)" : ""}`).join(" | ")} | ${sp.artifact}`);
  console.log(`  armor ${Object.values(v.armor!.pieces).map((p: any) => p.item.name + (p.item.masterworked || p.mwLevel >= 5 ? "" : " (not MW)")).join(", ")}`);
  console.log(`  combos ${v.loops.combos.map((c: any) => c.name).join(", ")} | solo gaps: ${v.loops.survives.join(", ") || "none"}`);
}
for (const b of m.best) console.log(`\n[best possible ${b.role}] score ${b.view.score.toFixed(1)} | ${b.view.spec.subclass} ${b.view.spec.exotic}`);
console.log("\nPATH");
for (const p of m.path) console.log(`  +${p.gain.toFixed(1)}%  ${p.what}  (${p.why})`);
console.log("\nNOW", JSON.stringify(m.now?.grades), JSON.stringify(m.now?.notes));
for (const p of m.possible) console.log(`POSSIBLE [${p.role}] ${p.view.spec.subclass} ${p.view.spec.exotic} | ${STAT_ORDER.map(k => p.view.stats[k]).join("/")} | same ${p.sameCore} | ${p.steps.map(x => x.what).join("; ")}`);
for (const t of m.targets) console.log(`TARGET ${t.title} | ${t.why} | ${t.where}`);

// Home view: three columns and the farm list.
for (const c of m.compare) {
  console.log(`\nCOMPARE ${c.role}: now ${c.now?.rating} ${JSON.stringify(c.now?.grades)} | own ${c.own.rating} ${JSON.stringify(c.own.grades)} | best ${c.best.rating} ${JSON.stringify(c.best.grades)} missing ${c.best.missing}`);
  console.log(`  changes: ${c.own.changes.join("; ")}`);
}
console.log("\nFARM");
for (const f of m.farm) console.log(`  [${f.kind}] ${f.title}${f.detail ? ` (${f.detail})` : ""}${f.replaces ? ` replaces ${f.replaces}` : ""} | ${f.where} | ${f.gain?.toFixed(1) ?? "-"}% | ${f.role}`);
for (const c of m.compare) console.log(`SETS ${c.role}: own [${(c.own.view.setPerks ?? []).map(p => p.name).join(", ")}] best [${(c.best.view.setPerks ?? []).map(p => p.name).join(", ")}]`);
for (const c of m.compare) console.log(`ART ${c.role}: own ${c.own.view.artifact?.name} [${c.own.view.spec.artifactPerks.join(", ")}] | best ${c.best.view.artifact?.name} [${c.best.view.spec.artifactPerks.join(", ")}] | now ${c.now?.spec.artifact}`);
