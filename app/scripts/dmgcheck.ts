// Dev: which of your special and heavy guns the damage sheet covers, and what they reach. npx tsx scripts/dmgcheck.ts <snapshot>
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { damageFor, ownedWeapons, withPerks } from "../src/engine/builds";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const ws = ownedWeapons(inv, defOf).filter(w => w.ammo > 1);
const frames = new Map<string, number>();
let hit = 0;
const rows: [number, string][] = [];
for (const w of ws) {
  // best perks per column for damage (try each option alone, keep improvements)
  let cur = w; let d = damageFor(w);
  const picks = w.cols.map(() => 0);
  w.cols.forEach((c, i) => c.options.forEach((_, j) => { const t = withPerks(w, picks.map((p, k) => k === i ? j : p)); const dt = damageFor(t); if (dt && (!d || dt.dps > d.dps)) { d = dt; cur = t; picks[i] = j; } }));
  if (!d) { const k = `${w.type} | ${w.frame || "(exotic) " + w.item.name}`; frames.set(k, (frames.get(k) ?? 0) + 1); continue; }
  hit++;
  rows.push([d.dps, `${d.dps.toString().padStart(6)} ${w.ammo === 3 ? "H" : "S"} T${w.tier} ${w.item.name} [${w.type}, ${w.frame || "exotic"}] ${d.exact ? "tested roll" : "missing " + d.missing.join(", ")} | row: ${d.row.name}: ${d.row.setup.slice(0, 70)}`]);
}
rows.sort((a, b) => b[0] - a[0]).slice(0, 25).forEach(r => console.log(r[1]));
console.log(`\n${hit} of ${ws.length} special/heavy guns matched. Unmatched groups:`);
[...frames].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, n]) => console.log(`  ${n} ${k}`));
