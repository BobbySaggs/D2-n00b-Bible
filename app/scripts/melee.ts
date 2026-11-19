import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx } from "../src/engine/evaluate";
import { fragmentBonus } from "../src/engine/builds";
import { byName } from "../src/knowledge/hunter";
import { solve, count100, type StatPlan } from "../src/engine/solve";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const fragSets: Record<string, string[]> = {
  b8best: ["Whisper of Shards", "Whisper of Chains", "Whisper of Conduction", "Whisper of Refraction", "Whisper of Impetus"],
  yours: ["Whisper of Rime", "Whisper of Durance", "Whisper of Refraction", "Whisper of Conduction", "Whisper of Shards"],
  tuned: ["Whisper of Chains", "Whisper of Impetus", "Whisper of Refraction", "Whisper of Conduction", "Whisper of Shards"],
};
const want = (big: string[]): StatPlan => Object.fromEntries(STAT_ORDER.map(k => [k, big.includes(k) ? { floor: 60, low: 1, high: 0.3, peak: 2 } : { floor: 60, low: 0.4, high: 0.1, peak: 0.2 }])) as StatPlan;
const seen = new Set<string>();
for (const [fn, fr] of Object.entries(fragSets)) {
  const bonus = fragmentBonus(fr.map(n => byName.get(n)!), ctx.defs);
  for (const big of [["melee","grenade","super","weapons"],["melee","grenade","super","health"],["melee","super","weapons","health"],["melee","grenade","weapons","health"],["melee","grenade","super","class"],["grenade","super","weapons","health"],["grenade","super","class","weapons"],["melee","grenade","class","weapons"]]) {
    for (const sol of solve(ctx.pieces, { cls: "Hunter", exotic: "Star-Eater Scales", plan: want(big), bonus, mw: "asIs", top: 6, minPower: ctx.light - 60 })) {
      const line = STAT_ORDER.map(k => `${k.slice(0,3)} ${sol.stats[k]}`).join(" ");
      if (seen.has(line) || count100(sol.stats) < 4 || Math.min(...STAT_ORDER.map(k => sol.stats[k])) < 55) continue; seen.add(line);
      console.log(`${fn} want ${big.join("+")}: ${line} | 100+: ${count100(sol.stats)} | mods ${sol.mods.join(",")} | ${Object.values(sol.pieces).map(p => p.item.name).join(", ")}`);
    }
  }
}
