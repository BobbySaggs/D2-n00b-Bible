import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx } from "../src/engine/evaluate";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
for (const p of ctx.pieces.filter(p => /Seventh Seraph/.test(p.item.name) && p.item.cls === "Hunter"))
  console.log(`${p.slot} ${p.item.name} T${p.tier} ${p.archetype} mw${p.mwLevel} P${p.item.power} legacy=${p.legacy} ${p.item.owner === "vault" ? "vault" : p.item.owner === hunter.id ? "hunter" : "other"} | ${STAT_ORDER.map(k => p.current[k]).join("/")}`);
console.log("\nall Hunter T5 pieces by slot+archetype:");
const t5 = ctx.pieces.filter(p => p.item.cls === "Hunter" && p.tier >= 5 && !p.exotic);
for (const p of t5) console.log(`  ${p.slot} ${p.item.name} ${p.archetype} | ${STAT_ORDER.map(k => p.current[k]).join("/")}`);
console.log("\nweapons Seventh Seraph/IKELOS:", ctx.weapons.filter(w => /Seventh Seraph|IKELOS/.test(w.item.name)).map(w => `${w.item.name} ${w.element} ${w.type} P${w.item.power}`).join("; "));
