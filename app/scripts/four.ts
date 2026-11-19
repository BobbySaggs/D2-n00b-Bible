import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx } from "../src/engine/evaluate";
import { fragmentBonus } from "../src/engine/builds";
import { byName } from "../src/knowledge/hunter";
import { solve, type StatPlan } from "../src/engine/solve";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const big = ["melee", "grenade", "super", "weapons"];
// The four must reach 100 (heavy penalty under), then lift the two others as evenly as possible.
const plan = Object.fromEntries(STAT_ORDER.map(k => [k, big.includes(k) ? { floor: 100, low: 0.2, high: 0.05 } : (k === "health" ? { floor: 65, low: 0.6, high: 0.1 } : { floor: 50, low: 0.6, high: 0.1 })])) as StatPlan;
const sets: Record<string, string[]> = {
  "Durance+Conduction+Chains+Impetus+Shards": ["Whisper of Durance", "Whisper of Conduction", "Whisper of Chains", "Whisper of Impetus", "Whisper of Shards"],
  "your earlier set (Rime, Durance, Refraction, Conduction, Shards)": ["Whisper of Rime", "Whisper of Durance", "Whisper of Refraction", "Whisper of Conduction", "Whisper of Shards"],
  "Steeped b8 (Shards, Chains, Conduction, Refraction, Impetus)": ["Whisper of Shards", "Whisper of Chains", "Whisper of Conduction", "Whisper of Refraction", "Whisper of Impetus"],
};
for (const [n, fr] of Object.entries(sets)) {
  const bonus = fragmentBonus(fr.map(x => byName.get(x)!), ctx.defs);
  for (const mw of ["asIs", "full"] as const) {
    const sol = solve(ctx.pieces, { cls: "Hunter", exotic: "Star-Eater Scales", plan, bonus, mw, top: 3, keepPerSlot: 20, minPower: ctx.light - 60 });
    for (const x of sol.slice(0, 2)) console.log(`${n} [${mw}]: ${STAT_ORDER.map(k => `${k.slice(0,3)} ${x.stats[k]}`).join(" ")} | mods ${x.mods.join(",")} | ${Object.values(x.pieces).map(p => p.item.name + (p.mwLevel >= 5 ? "*" : "")).join(", ")}`);
  }
}
{
  const fr = ["Whisper of Refraction", "Whisper of Conduction", "Whisper of Chains", "Whisper of Impetus", "Whisper of Shards"];
  const x = solve(ctx.pieces, { cls: "Hunter", exotic: "Star-Eater Scales", plan, bonus: fragmentBonus(fr.map(n => byName.get(n)!), ctx.defs), mw: "asIs", top: 1, keepPerSlot: 20, minPower: ctx.light - 60 })[0];
  console.log("\nPICK", STAT_ORDER.map(k => `${k} ${x.stats[k]}`).join(", "));
  Object.values(x.pieces).forEach((p, i) => console.log(` ${p.slot}: ${p.item.name} | T${p.tier} ${p.archetype} | mw ${p.mwLevel} | Power ${p.item.power} | ${p.item.owner === hunter.id ? "on Hunter" : p.item.owner === "vault" ? "vault" : "other character"} | +10 ${x.mods[i]} | base ${STAT_ORDER.map(k => p.current[k]).join("/")}`));
}
