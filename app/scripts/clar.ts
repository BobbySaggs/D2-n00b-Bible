// Dev check of the Clarity hookup with a local copy of their file (never shipped).
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { maxHunter } from "../src/engine/maxhunter";
import { parseClarity, setClarity, clarityFor } from "../src/bungie/clarity";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
if (process.argv[3]) { const perks = parseClarity(JSON.parse(readFileSync(process.argv[3], "utf8"))); setClarity(perks);
  console.log("clarity perks", perks.length, "with dmg", perks.filter(p => p.dmgPct).length, "dr", perks.filter(p => p.drPct).length, "energy", perks.filter(p => Object.keys(p.energy).length).length);
  for (const n of ["Kill Clip", "Bait and Switch", "Demolitionist", "Explosive Light", "Adrenaline Junkie"]) { const p = perks.find(x => x.name === n); console.log(" ", n, p?.dmgPct, p?.drPct, JSON.stringify(p?.energy)); } }
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const m = maxHunter(inv, h => defs.get(h), [...defs.values()], hunter.id, s.catalog ?? [], undefined, false);
for (const r of m.reports) { const v = r.view;
  console.log(`\n[${r.role}] ${v.score.toFixed(1)} ${r.confidence} | ${r.confidenceWhy}`);
  console.log(`  ${v.spec.subclass} ${v.spec.aspects.join("+")} ${v.spec.exotic} | weapons ${v.weapons.map(w => w?.item.name).join(", ")} | ${v.spec.artifact}: ${(v.spec.artifactPerks ?? []).join(", ")}`);
  void clarityFor;
}
