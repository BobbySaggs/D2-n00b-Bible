import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { readPiece, type Piece } from "../src/engine/armor";
import { searchBuilds, fitArmor, availableKit } from "../src/engine/builds";
import { count100, lowest } from "../src/engine/solve";
import { STAT_ORDER } from "../src/bungie/config";
import type { Goal } from "../src/engine/loops";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const pieces = inv.items.map(i => readPiece(i, defOf)).filter(Boolean) as Piece[];
const wornIds = new Set(inv.items.filter(i => i.owner === hunter.id && i.equipped).map(i => i.id));
if (process.argv[3] === "kit") { for (const [k, v] of availableKit(inv, defOf, hunter.id)) console.log(k, [...v].join(", ")); process.exit(0); }
const goals = (process.argv[3]?.split(",") ?? ["abilities", "bossDps", "survival"]) as Goal[];
for (const goal of goals) {
  const t = Date.now();
  const bs = searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: Number(process.argv[4] ?? 4) });
  console.log(`\n================ ${goal} (${Date.now() - t} ms)`);
  for (const b of bs) {
    const exoHash = inv.items.find(i => i.name === b.exotic.name && i.cls === "Hunter")!.hash;
    const a = fitArmor(b, pieces, { mw: "asIs", wornIds });
    console.log(`\n# ${b.subclass} + ${b.exotic.name}  score ${b.score.toFixed(1)}`);
    console.log(`  ${b.super.name} | ${b.grenade.name} | ${b.melee.name} | ${b.classAbility.name}`);
    console.log(`  aspects: ${b.aspects.map(x => x.name).join(", ")} | fragments: ${b.fragments.map(x => x.name).join(", ")}`);
    console.log(`  weapons: ${b.weapons.map(w => `${w.item.name} (${w.element}, ${w.ks.map(k => k.name).filter(n => n !== w.item.name).join("/") || "-"})`).join(" | ")}`);
    console.log(`  energy loops: ${b.loops.energy.map(e => `${e.ability} <- ${e.refills.join(", ")}`).join(" ;; ")}`);
    console.log(`  artifact: ${b.artifact ? b.artifact.artifact.name + " :: " + b.artifact.perks.map(p => p.perk.name + (p.perk.read === "description" ? "*" : "")).join(", ") : "none"}`);
    console.log(`  combos: ${b.loops.combos.map(c => c.name).join(", ") || "none"}`);
    console.log(`  unfed: ${b.loops.unfed.map(u => `${u.name} needs ${u.token}`).join("; ") || "none"}`);
    if (a) console.log(`  stats: ${STAT_ORDER.map(k => `${k.slice(0, 3)} ${a.stats[k]}`).join(" ")} | 100+: ${count100(a.stats)} low ${lowest(a.stats)} | mods ${a.mods.join(",")} | armor: ${Object.values(a.pieces).map(p => p.item.name + (p.mwLevel === 5 ? "*" : "")).join(", ")}`);
  }
}
