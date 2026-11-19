import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, evaluate, tuneCurrent, stepsFrom, evaluateNow } from "../src/engine/evaluate";
import { STAT_ORDER } from "../src/bungie/config";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
const spec = { ...tuneCurrent(ctx, "whole")!, exotic: "Star-Eater Scales", armorLocks: {}, fragments: ["Whisper of Refraction", "Whisper of Conduction", "Whisper of Chains", "Whisper of Impetus", "Whisper of Shards"] };
const targets = { melee: 100, grenade: 100, super: 100, weapons: 100 };
for (const tune of [false, true]) {
  const t = Date.now();
  const v = evaluate(spec, ctx, { targets, mw: "asIs", style: "peaks", tune });
  console.log(`tune=${tune} (${Date.now() - t} ms): ${STAT_ORDER.map(k => `${k} ${v.stats[k]}`).join(", ")} | issues: ${v.issues.join(" ") || "none"}`);
  console.log("   armor:", Object.values(v.armor!.pieces).map(p => `${p.item.name}(P${p.item.power})`).join(", "), "| mods", v.armor!.mods.join(","), "| tuning", Object.entries(v.armor!.tuning).map(([k, x]) => `${k}: ${x!.name}`).join("; ") || "none");
  if (tune) console.log("   steps:", stepsFrom(evaluateNow(ctx, "whole", { targets, mw: "asIs", style: "peaks" })!, v, ctx).map(x => x.what).join(" | "));
}
