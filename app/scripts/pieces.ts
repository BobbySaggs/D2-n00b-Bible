import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { readPiece, pieceStats } from "../src/engine/armor";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
let ok = 0, bad = 0, legacy = 0; const bads: string[] = [];
for (const it of inv.items) {
  const p = readPiece(it, h => defs.get(h)); if (!p) continue;
  if (p.legacy) { legacy++; continue; }
  const pred = pieceStats(p, "asIs");
  const real = STAT_ORDER.map(k => it.stats[k]);
  const mine = STAT_ORDER.map(k => pred[k] + p.mod[k]);
  if (real.every((v, i) => v === mine[i])) ok++; else { bad++; if (bads.length < 12) bads.push(`${it.name} T${p.tier} mw${p.mwLevel} ${p.archetype} real ${real} model ${mine} base ${STAT_ORDER.map(k => p.base[k])} tun ${STAT_ORDER.map(k => p.tuning[k])}`); }
}
console.log({ ok, bad, legacy }); console.log(bads.join("\n"));
const leg = inv.items.map(it => readPiece(it, h => defs.get(h))).filter(p => p && p.legacy);
const byT: Record<string, number> = {}; for (const p of leg) byT[`T${p!.tier} pw${Math.floor(p!.item.power / 100) * 100} ${p!.item.cls}`] = (byT[`T${p!.tier} pw${Math.floor(p!.item.power / 100) * 100} ${p!.item.cls}`] ?? 0) + 1;
console.log(byT);
