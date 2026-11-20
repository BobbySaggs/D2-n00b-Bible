import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { ownedWeapons } from "../src/engine/builds";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const ws = ownedWeapons(inv, h => defs.get(h), 400).filter(w => w.duel !== undefined).sort((a, b) => b.duel! - a.duel!);
for (const ammo of [1, 2, 3]) { console.log(`\n-- ammo ${ammo}`); for (const w of ws.filter(w => w.ammo === ammo).slice(0, 8)) console.log(`${w.duel!.toFixed(1)}  ${w.item.name} (${w.type}, ${w.item.slot}, P${w.item.power}) ${JSON.stringify(w.wstats)}`); }
console.log("\nunrated types:", [...new Set(ownedWeapons(inv, h => defs.get(h), 400).filter(w => w.duel === undefined).map(w => w.type))].join(", "));
