// Test data only: add armor set data (set hash, name, 2- and 4-piece bonuses) to every armor definition in a
// snapshot, from a local copy of Bungie's manifest tables (the same shape loadDefs builds in the app).
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import type { ArmorSet } from "../src/bungie/defs";

const [snapIn, dir, snapOut] = process.argv.slice(2);
const s = JSON.parse(gunzipSync(readFileSync(snapIn)).toString());
const load = (n: string) => JSON.parse(readFileSync(`${dir}/${n}.json`, "utf8"));
const items: Record<string, any> = {};
for (const p of [1, 2, 3, 4]) Object.assign(items, load(`DestinyInventoryItemDefinition_part${p}`));
const setDefs = load("DestinyEquipableItemSetDefinition"), sbx = load("DestinySandboxPerkDefinition");
const sets = new Map<number, ArmorSet>();
const setOf = (h: number): ArmorSet => {
  if (!sets.has(h)) {
    const d = setDefs[h];
    sets.set(h, { hash: h, name: d?.displayProperties?.name ?? "", perks: (d?.setPerks ?? []).map((p: any) => ({ count: p.requiredSetCount, hash: p.sandboxPerkHash, name: sbx[p.sandboxPerkHash]?.displayProperties?.name ?? "", desc: String(sbx[p.sandboxPerkHash]?.displayProperties?.description ?? "").replace(/\s+/g, " ").trim() })) });
  }
  return sets.get(h)!;
};
let n = 0;
for (const [h, d] of Object.entries<any>(s.defs)) {
  d.v = 3;
  const sh = items[h]?.equippingBlock?.equipableItemSetHash;
  if (sh) { d.setHash = sh; d.set = setOf(sh); n++; }
}
writeFileSync(snapOut, gzipSync(JSON.stringify(s)));
console.log(`armor with a set: ${n}, sets: ${sets.size}`);
for (const st of sets.values()) console.log(`  ${st.name}: ${st.perks.map(p => `${p.count}pc ${p.name}`).join(", ")}`);
