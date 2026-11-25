import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, specFromBuild } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { CLASS_SUBS } from "../src/knowledge/hunter";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, defOf, [...defs.values()], hunter.id);
const goal = (process.argv[3] ?? "abilities") as any;
const set = { targets: {}, mw: "full", style: "peaks", tune: true } as any;
for (const sub of CLASS_SUBS[(process.env.CLS ?? "Hunter") as "Hunter"]) {
  const found = searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: 6, require: { subclass: sub } }).map(specFromBuild);
  const r = found.map(sp => ({ sp, v: evaluate({ ...sp, goal }, ctx, set) })).sort((a, b) => a.v.issues.length - b.v.issues.length || b.v.score - a.v.score)[0];
  if (!r) { console.log(sub, "none"); continue; }
  const { sp, v } = r;
  const unv = v.artifactPerks.filter((p: any) => p.read !== "checked").map((p: any) => p.name);
  console.log(`\n${sub}: score ${v.score.toFixed(1)} loops ${v.loopScore.toFixed(1)} | ${STAT_ORDER.map(k => v.stats[k]).join("/")}`);
  console.log(`  ${sp.super} | ${sp.grenade} | ${sp.melee} | ${sp.classAbility} | ${sp.aspects.join(" + ")} | ${sp.exotic}`);
  console.log(`  frags ${sp.fragments.join(", ")}`);
  console.log(`  weapons ${v.weapons.map((w: any) => `${w?.item.name} T${w?.tier} P${w?.item.power}${w?.infuse ? " INFUSE" : ""} [${w?.ks.slice(w.base.length).map((k: any) => k.name + (k.read === "checked" ? "*" : "")).join(", ")}]`).join(" | ")}`);
  console.log(`  stat ${v.statScore.toFixed(1)}`);
  console.log(`  art  | ${sp.artifact}: ${(sp.artifactPerks ?? []).join(", ")} | unverified: ${unv.join(", ")}`);
  console.log(`  combos ${v.loops.combos.map((c: any) => c.name).join(", ")} | idle ${v.loops.unfed.map((u: any) => u.name).join(", ")}`);
}
