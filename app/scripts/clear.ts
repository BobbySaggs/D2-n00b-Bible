import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, tuneCurrent, pointsByPiece } from "../src/engine/evaluate";
import { STAT_ORDER } from "../src/bungie/config";
import { HUNTER } from "../src/knowledge/hunter";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === (process.env.CLS ?? "Hunter"))!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const goal = "abilities" as const;
const kit = ctx.kit.get("Revenant")!;
const set = { targets: { melee: 100, grenade: 100, super: 100, weapons: 100 }, mw: "asIs" as const, style: "peaks" as const, tune: true };
const base = { ...tuneCurrent(ctx, goal)!, exotic: "Star-Eater Scales", armorLocks: {}, aspects: ["Shatterdive", "Grim Harvest"], fragments: ["Whisper of Refraction", "Whisper of Conduction", "Whisper of Chains", "Whisper of Impetus", "Whisper of Shards"], goal };
const v0 = evaluate(base, ctx, set);
const show = (l: string, v: any) => console.log(`${l}: score ${v.score.toFixed(1)} loops ${v.loopScore.toFixed(1)} | ${STAT_ORDER.map(k => v.stats[k]).join("/")} | combos ${v.loops.combos.map((c: any) => c.name).join(", ")}`);
show("BASE (Star-Eater, Glacier, Shatterdive+Touch)", v0);
console.log("  aspects", base.aspects, "melee", base.melee, "class", base.classAbility, "super", base.super, "weapons", v0.weapons.map(w => w?.item.name));
const tries: [string, any][] = [];
for (const ex of ["Fr0st-EE5", "Renewal Grasps", "Mask of Fealty", "Gyrfalcon's Hauberk", "Star-Eater Scales"]) tries.push([`exotic ${ex}`, { exotic: ex }]);
for (const a of HUNTER.filter(k => k.kind === "aspect" && k.subs?.includes("Revenant"))) if (!base.aspects.includes(a.name)) tries.push([`aspect ${a.name} for Grim Harvest`, { aspects: ["Shatterdive", a.name] }]);
for (const f of HUNTER.filter(k => k.kind === "fragment" && k.subs?.includes("Revenant") && kit.has(k.name))) for (const [i, old] of base.fragments.entries()) if (!base.fragments.includes(f.name)) tries.push([`fragment ${f.name} for ${old}`, { fragments: base.fragments.map((x, j) => j === i ? f.name : x) }]);
for (const w of ctx.weapons.filter(w => w.item.slot === "kinetic" || w.item.slot === "power")) { const ws = [...base.weapons]; ws[w.item.slot === "kinetic" ? 0 : 2] = w.item.id; tries.push([`weapon ${w.item.name} (${w.item.slot}, ${w.type}, ${w.element})`, { weapons: ws }]); }
for (const g of ["Shatter Grenade", "Duskfield Grenade", "Coldsnap Grenade"]) tries.push([`grenade ${g}`, { grenade: g }]);
const res: [number, string][] = [];
for (const [l, mod] of tries) { const v = evaluate({ ...base, ...mod }, ctx, set); if (v.score - v0.score > 0.5) res.push([v.score - v0.score, `${l} | ${STAT_ORDER.map(k => v.stats[k]).join("/")} | combos ${v.loops.combos.map((c: any) => c.name).join(", ")}`]); }
res.sort((a, b) => b[0] - a[0]).slice(0, 15).forEach(([d, t]) => console.log(`+${d.toFixed(1)} ${t}`));
if (0) for (const [l, mod] of tries) { const v = evaluate({ ...base, ...mod }, ctx, set); console.log(`${(v.score - v0.score >= 0 ? "+" : "") + (v.score - v0.score).toFixed(1)}  ${l} | ${STAT_ORDER.map(k => v.stats[k]).join("/")} | combos ${v.loops.combos.map((c: any) => c.name).join(", ")}`); }
for (const art of ["Slayer Baron Apothecary Satchel", "NPA Repulsion Regulator"]) {
  const a = ctx.artifacts.find(x => x.name === art); if (!a) { console.log("no", art); continue; }
  const { refitArtifact } = await import("../src/engine/evaluate");
  const sp = { ...base, ...refitArtifact(base, ctx, art) };
  const v = evaluate(sp, ctx, set); console.log(`artifact ${art}: ${(v.score - v0.score).toFixed(1)} perks ${sp.artifactPerks.join(", ")} | combos ${v.loops.combos.map((c: any) => c.name).join(", ")}`);
}
console.log("\nweapons by points:", pointsByPiece(v0).filter(p => p.group === "Weapons").map(p => `${p.name} ${p.points.toFixed(1)}`).join(" | "));
