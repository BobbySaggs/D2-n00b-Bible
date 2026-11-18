import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, currentSpec } from "../src/engine/evaluate";
import { planFor } from "../src/engine/builds";
import { planValue } from "../src/engine/solve";
import { pieceStats } from "../src/engine/armor";
import { byName } from "../src/knowledge/hunter";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const set = { healthFloor: 60, mw: "asIs" as const };
const cur = currentSpec(ctx, "abilities")!;
const A = { ...cur, aspects: ["Winter's Shroud", "Grim Harvest"], fragments: ["Whisper of Shards", "Whisper of Chains", "Whisper of Torment", "Rending", "Whisper of Hunger"].map(n => n.startsWith("Whisper") ? n : "Whisper of " + n), armorLocks: {} };
const free = evaluate(A, ctx, set);
const locked = evaluate({ ...A, armorLocks: cur.armorLocks }, ctx, set);
const tot = (x: Record<string, number>) => STAT_ORDER.reduce((t, k) => t + x[k], 0);
console.log("bonus", free.bonus);
for (const [n, v] of [["free", free], ["worn armor", locked]] as const) {
  const plan = planFor({ super: byName.get(A.super)!, grenade: byName.get(A.grenade)!, melee: byName.get(A.melee)!, classAbility: byName.get(A.classAbility)!, aspects: A.aspects.map(x => byName.get(x)!), fragments: A.fragments.map(x => byName.get(x)!), exotic: byName.get(A.exotic)!, weapons: [] }, "abilities", 60);
  console.log(n, v.stats, "total", tot(v.stats), "value", planValue(v.stats, plan).toFixed(1), Object.values(v.armor!.pieces).map(p => `${p.item.name}:${tot(pieceStats(p, "asIs"))}`).join(", "));
}
