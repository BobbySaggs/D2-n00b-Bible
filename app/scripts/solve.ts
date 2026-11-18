import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { readPiece, type Piece } from "../src/engine/armor";
import { solve, count100, lowest, type StatPlan } from "../src/engine/solve";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const pieces = inv.items.map(i => readPiece(i, h => defs.get(h))).filter(Boolean) as Piece[];
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const worn = inv.items.filter(i => i.owner === hunter.id && i.equipped && i.kind === "armor");
const wornIds = new Set(worn.map(i => i.id));
const plan: StatPlan = { health: { floor: 60, low: 0.8, high: 0.3 }, melee: { floor: 50, low: 0.5, high: 0.1 }, grenade: { floor: 50, low: 1.2, high: 0.6 },
  super: { floor: 50, low: 0.8, high: 0.2 }, class: { floor: 50, low: 0.6, high: 0.1 }, weapons: { floor: 50, low: 0.8, high: 0.3 } };
const bonus = { health: 10, melee: 10, grenade: 0, super: 10, class: 0, weapons: 0 };
const fmt = (st: Record<string, number>) => STAT_ORDER.map(k => `${k.slice(0, 3)} ${st[k]}`).join("  ");
console.log("WORN     ", fmt(hunter.stats), "| over100", count100(hunter.stats), "low", lowest(hunter.stats));
for (const mw of ["asIs", "full"] as const) {
  const t = Date.now();
  const r = solve(pieces, { cls: "Hunter", exoticHash: worn.find(i => i.exotic)!.hash, plan, bonus, mw, wornIds, top: 3 });
  console.log(`\n${mw} (${Date.now() - t} ms)`);
  for (const x of r) console.log(fmt(x.stats), "| over100", count100(x.stats), "low", lowest(x.stats), "swaps", x.swaps, "mods", x.mods.join(","), "\n   ", Object.values(x.pieces).map(p => `${p.item.name} T${p.tier}${p.mwLevel === 5 ? " MW" : ""}`).join(" | "));
}
