import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { ownedWeapons } from "../src/engine/builds";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const ws = ownedWeapons(inv, defOf);
const inst = s.profile.itemComponents.instances.data;
console.log("weapons >=400:", ws.length, "rated by a known perk/name:", ws.filter(w => w.rated).length);
for (const w of ws.filter(w => w.ammo === 3 || ["The Hothead","Cynosure","IRONWOOD 03","Out of Bounds"].includes(w.item.name)).slice(0, 400)) {
  const t = inst[w.item.id]?.gearTier;
  if (!(w.rated || t === 5 || ["The Hothead","Cynosure"].includes(w.item.name))) continue;
  const perks = w.item.plugs.map(h => defOf(h)?.name).filter(Boolean).filter(n => !/Tracker|Shader|Ornament|Empty|Default/.test(n!));
  console.log(`${w.item.name} T${t} P${w.item.power} known=[${w.ks.map(k => k.name).join(", ")}] perks=${perks.slice(0, 9).join(", ")}`);
}
