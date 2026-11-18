// Dev-only: run the inventory model on a real snapshot. The snapshot never goes into git.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { summarize } from "../src/model/summary";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const sum = summarize(inv);
console.log(JSON.stringify({ chars: inv.characters, sum }, null, 1));
const armor = inv.items.filter(i => i.kind === "armor");
const tiers: Record<string, number> = {};
for (const a of armor) tiers[a.cls + " T" + a.gearTier] = (tiers[a.cls + " T" + a.gearTier] ?? 0) + 1;
console.log("armor tiers", tiers, "items", inv.items.length);
