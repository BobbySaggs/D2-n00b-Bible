// Referee and "beat it": score every community build in knowledge/research/builds.json against a snapshot.
//   as published: the build exactly as its creator lists it (pieces you lack join as stand-ins), fully masterworked
//   Steeped's version: the same core (subclass, exotic, aspects, abilities) with Steeped free to pick the rest
// A published build that scores far below Steeped's best means Steeped is probably missing a rule; it's flagged
// with the pieces Steeped can't rate. Usage: npx tsx scripts/referee.ts <snapshot.json.gz> [builds.json]
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { evaluate, makeCtx, specFromBuild, type BuildSpec, type Settings } from "../src/engine/evaluate";
import { searchBuilds } from "../src/engine/builds";
import { withCatalog } from "../src/engine/catalog";
import { byName } from "../src/knowledge/hunter";
import { BUILDS, type CommunityBuild } from "../src/knowledge/research";
import type { Goal } from "../src/engine/loops";

const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const builds: CommunityBuild[] = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], "utf8")).builds : BUILDS;
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const defOf = (h: number) => defs.get(h);
const inv0 = buildInventory(s.profile, defOf, s.account);
const hunter = inv0.characters.find(c => c.cls === "Hunter")!;
const { inv } = withCatalog(inv0, defOf, s.catalog ?? [], hunter.id);
const ctx = makeCtx(inv, defOf, [...defs.values()], hunter.id);
const full: Settings = { targets: {}, mw: "full", style: "peaks", tune: true };
const goalOf = (b: CommunityBuild): Goal => (b.role === "boss" ? "bossDps" : b.role === "survive" ? "survival" : b.role === "pvp" ? "crucible" : "whole");
const best = new Map<Goal, number>();
const bestFor = (g: Goal) => {
  if (!best.has(g)) {
    const f = searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal: g, top: 3 }).map(specFromBuild);
    best.set(g, Math.max(...f.map(sp => evaluate({ ...sp, goal: g }, ctx, full).score)));
  }
  return best.get(g)!;
};
const owned = (name: string) => inv0.items.some(i => i.name === name);
const idOf = (name: string) => [...inv.items].filter(i => i.name === name).sort((a, b) => (a.owner === "catalog" ? 1 : 0) - (b.owner === "catalog" ? 1 : 0) || b.power - a.power)[0]?.id;

for (const b of builds) {
  const goal = goalOf(b);
  const named = [b.super, b.grenade, b.melee, b.classAbility, ...b.aspects, ...b.fragments, b.exotic].filter((x): x is string => !!x);
  const unrated = named.filter(n => !byName.has(n));
  const weapons = (["kinetic", "energy", "power"] as const).map(sl => { const w = b.weapons.find(x => inv.items.some(i => i.name === x.name && i.slot === sl)); return w ? idOf(w.name) ?? "" : ""; });
  const spec: BuildSpec = {
    goal, subclass: b.subclass, super: b.super ?? "", grenade: b.grenade ?? "", melee: b.melee ?? "", classAbility: b.classAbility ?? "",
    aspects: b.aspects, fragments: b.fragments, exotic: b.exotic, weapons, armorLocks: {}, artifact: "", artifactPerks: b.artifactPerks ?? [],
  };
  const pub = evaluate(spec, ctx, full);
  const mine = searchBuilds({ inv, defOf, defs: [...defs.values()], characterId: hunter.id, goal, top: 3, require: { subclass: b.subclass, exotic: b.exotic, aspects: b.aspects, ...(b.super && { super: b.super }), ...(b.grenade && { grenade: b.grenade }), ...(b.melee && { melee: b.melee }) } }).map(specFromBuild);
  const better = mine.map(sp => evaluate({ ...sp, goal }, ctx, full)).sort((x, y) => y.score - x.score)[0];
  const top = bestFor(goal);
  const pct = (x: number) => Math.round((100 * x) / top);
  const flag = pct(pub.score) < 85 ? "  << FLAG: far below Steeped's best; Steeped may be missing a rule" : "";
  console.log(`\n${b.name} (${b.role}, ${b.source.creator ?? b.source.title}, ${b.source.date ?? ""})`);
  console.log(`  as published ${pct(pub.score)} of Steeped's best${pub.issues.length ? ` | issues: ${pub.issues.slice(0, 2).join(" ")}` : ""}${flag}`);
  if (better) console.log(`  Steeped's version ${pct(better.score)} (${better.score > pub.score ? "+" : ""}${Math.round((100 * (better.score - pub.score)) / Math.max(1, pub.score))}% vs published): ${[better.spec.grenade, better.spec.melee, ...better.spec.fragments].join(", ")}`);
  console.log(`  you own: ${[b.exotic, ...b.weapons.map(w => w.name)].map(n => `${n}${owned(n) ? "" : " (missing)"}`).join(", ")}`);
  if (unrated.length) console.log(`  Steeped can't rate: ${unrated.join(", ")}`);
}
