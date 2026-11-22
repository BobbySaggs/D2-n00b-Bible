import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, specFromBuild, pointsByPiece } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv = buildInventory(s.profile, defOf, s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, defOf, [...defs.values()], hunter.id);
const goal = "abilities" as const;
const top = specFromBuild(searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: 1, require: { subclass: "Revenant", aspects: ["Shatterdive", "Grim Harvest"], exotic: "Star-Eater Scales" } })[0]);
const set = { targets: { melee: 100, grenade: 100, super: 100, class: 100, weapons: 100, health: 0 }, mw: "full", style: "peaks", tune: true } as any;
const id = (n: string) => (inv as any).items.filter((i: any) => i.name === n).sort((a: any, b: any) => b.power - a.power)[0]?.id;
const worn = (inv as any).items.filter((i: any) => i.owner === hunter.id && i.equipped);
const artNow = (ctx as any).artifacts ? Object.keys((ctx as any).artifacts) : [];
const npa = (inv as any).items.find((i: any) => i.kind === "artifact" && i.owner === hunter.id && i.equipped);
console.log("equipped artifact", npa?.name, "perks", JSON.stringify((inv as any).artifacts?.[npa?.id] ?? null).slice(0, 300));
const MINE = ["Shatter Orbs", "Volatile Flow", "Targeting Autoloader", "Sustained Fire", "Bricks from Beyond", "Shock and Awe", "Squad Goals"];
const variants: [string, any][] = [
  ["Steeped pick", top],
  ["Gnawing Hunger + same artifact", { ...top, weapons: [top.weapons[0], id("Gnawing Hunger"), top.weapons[2]] }],
  ["Gnawing Hunger + NPA (yours)", { ...top, weapons: [top.weapons[0], id("Gnawing Hunger"), top.weapons[2]], artifact: "NPA Repulsion Regulator", artifactPerks: MINE }],
  ["Out of Bounds + NPA (yours)", { ...top, artifact: "NPA Repulsion Regulator", artifactPerks: MINE }],
];
for (const [l, sp] of variants) {
  const v = evaluate({ ...sp, goal }, ctx, set);
  console.log(`\n${l}: score ${v.score.toFixed(1)} loops ${v.loops ? v.loopScore.toFixed(1) : ""} | ${STAT_ORDER.map(k => v.stats[k]).join("/")}`);
  console.log("  weapons", v.weapons.map((w: any) => w?.item.name).join(" | "), "| artifact", sp.artifact || "(equipped)", (sp.artifactPerks ?? []).join(", "));
  console.log("  perks used", v.artifactPerks.map((p: any) => p.name + (p.read === "checked" ? "*" : "")).join(", "));
  console.log("  combos", v.loops.combos.map((c: any) => c.name).join(", "), "| idle", v.loops.unfed.map((u: any) => u.name).join(", "));
}
