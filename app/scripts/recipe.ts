import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, tuneCurrent, fullModPlan, modPlan } from "../src/engine/evaluate";
import { STAT_ORDER, ARMOR_SLOTS } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const v = evaluate(tuneCurrent(ctx, "whole")!, ctx, { healthFloor: 100, mw: "asIs", style: "peaks" });
const sp = v.spec;
console.log(sp.subclass, "|", sp.super, "|", sp.grenade, "|", sp.melee, "|", sp.classAbility);
console.log("aspects:", sp.aspects.join(", "), "| fragments:", sp.fragments.join(", "));
console.log("weapons:", v.weapons.map(w => `${w?.item.name} (${w?.item.power})`).join(" | "));
console.log("artifact:", v.artifact?.name, "::", (sp.artifactPerks ?? []).join(", "));
console.log("stats:", STAT_ORDER.map(k => `${k} ${v.stats[k]}`).join(", "));
const mp = modPlan(v);
for (const pm of fullModPlan(v, ctx)) {
  const p = pm.piece; const m = mp[pm.slot];
  console.log(`${pm.slot}: ${p.item.name} (T${p.tier} ${p.archetype}, ${p.item.owner === "vault" ? "vault" : p.item.owner === hunter.id ? "Hunter" : "other char"}) | +10 ${m?.stat ?? pm.statMod?.stat ?? "-"} | mods: ${pm.mods.map(x => x.name).join(", ")}`);
}
