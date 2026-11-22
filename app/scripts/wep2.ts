import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const w = inv.items.find(i => i.name === "Roar of the Bear" && i.power === 464)!;
console.log(w.gearTier, w.plugs.map(h => `${h}:${defOf(h)?.name}|${defOf(h)?.plugCat}`));
for (const [i, l] of Object.entries(w.reusable)) console.log(i, l.map(h => `${defOf(h)?.name}`).join(", "));
console.log("desc", defOf(w.plugs[4])?.desc);
const cats = new Map<string, number>(); let missing = 0;
for (const it of inv.items.filter(i => i.kind === "weapon")) for (const [i, l] of Object.entries(it.reusable)) for (const h of l) { const d = defOf(h); if (!d) { missing++; continue; } cats.set(d.plugCat, (cats.get(d.plugCat) ?? 0) + 1); }
console.log("missing defs", missing, [...cats].sort((a, b) => b[1] - a[1]).slice(0, 15));
