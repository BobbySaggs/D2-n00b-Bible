import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, currentSpec } from "../src/engine/evaluate";
import { STAT_ORDER, type StatKey } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const base = { ...currentSpec(ctx, "abilities")!, armorLocks: {} };
for (const mw of ["asIs", "full"] as const) for (const skip of STAT_ORDER) {
  const targets = Object.fromEntries(STAT_ORDER.filter(k => k !== skip).map(k => [k, 100])) as Partial<Record<StatKey, number>>;
  const v = evaluate(base, ctx, { targets, mw, style: "peaks", tune: true });
  const n = STAT_ORDER.filter(k => v.stats[k] >= 100).length;
  console.log(`${mw} all but ${skip}: ${STAT_ORDER.map(k => v.stats[k]).join("/")} -> ${n} at 100+ | ${Object.values(v.armor!.pieces).map(p => p.item.name + (p.mwLevel >= 5 ? "" : "~")).join(", ")} | mods ${v.armor!.mods.join(",")} | tune ${Object.entries(v.armor!.tuning).map(([k, t]) => `${k}:${t!.name}`).join("; ")}`);
}
