import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { maxHunter } from "../src/engine/maxhunter";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const m = maxHunter(inv, h => defs.get(h), [...defs.values()], hunter.id, s.catalog ?? [], undefined, false);
for (const r of m.reports) {
  const v = r.view;
  const parts = [...v.coreParts.map(p => p.k), ...v.perkParts.map(p => p.k), ...v.weapons.flatMap(w => (w ? w.ks : []))];
  console.log(r.role, r.stars, r.confidence, "|", r.confidenceWhy);
  console.log("  unverified:", parts.filter((k: any) => k.read === "description").map(k => k.name).join(", "));
  console.log("  type-only weapons:", v.weapons.filter(w => w && !w.rated).map(w => w!.item.name).join(", "));
}
