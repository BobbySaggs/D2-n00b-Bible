import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
for (const n of ["Luminopotent Cuirass", "Iron Battalion Vest"]) {
  const it = inv.items.find(i => i.name === n)!;
  const d = defs.get(it.hash)!;
  console.log(n, it.owner, "sockets", d.sockets.map((x, i) => `${i}:${x.reusable}`).join(" "));
  for (const [i, l] of Object.entries(it.options)) console.log("  opt", i, l.length, l.slice(0, 6).map(h => defs.get(h)?.name ?? "NODEF").join(", "));
  console.log("  plugged", it.plugs.map(h => defs.get(h)?.name ?? h).join(" | "));
}
