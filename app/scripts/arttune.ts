// Tune my artifact on a snapshot: for each job, the artifact you wear vs the best of all seven for the same build.
// npx tsx scripts/arttune.ts <snapshot.json.gz>
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { buildInventory } from "../src/model/inventory";
import { makeCtx, tuneArtifactNow } from "../src/engine/evaluate";
import type { Goal } from "../src/engine/loops";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const inv = buildInventory(s.profile, h => defs.get(h), s.account);
const hunter = inv.characters.find(c => c.cls === "Hunter")!;
const ctx = makeCtx(inv, h => defs.get(h), [...defs.values()], hunter.id);
console.log("artifacts:", ctx.artifacts.map(a => `${a.name}${a.equipped ? " (on)" : ""}: ${a.sockets.length} sockets, ${new Set(a.sockets.flatMap(x => x.options.map(o => o.name))).size} perks`).join("; "));
const guessed = [...ctx.perks.values()].filter(p => p.read === "description").map(p => p.name);
console.log("perks without a checked rule:", guessed.length ? guessed.join(", ") : "none");
for (const g of ["whole", "bossDps", "survival", "abilities"] as Goal[]) {
  const t = tuneArtifactNow(ctx, g, { targets: {}, mw: "asIs", style: "peaks", tune: true });
  if (!t) { console.log(g, "no tune"); continue; }
  console.log(`\n== ${g}: ${t.now.spec.subclass} · ${t.now.spec.exotic} · ${t.now.weapons.map(w => w?.item.name).join(", ")}`);
  console.log(`  now  ${t.now.spec.artifact} [${(t.now.spec.artifactPerks ?? []).join(", ")}] score ${t.now.score.toFixed(1)}`);
  console.log(`  best ${t.best.spec.artifact} [${(t.best.spec.artifactPerks ?? []).join(", ")}] score ${t.best.score.toFixed(1)} (+${t.gain.toFixed(1)})`);
  console.log(`  add ${t.add.join(", ") || "-"} | remove ${t.remove.join(", ") || "-"}`);
  for (const o of t.options) console.log(`    ${o.score.toFixed(1).padStart(6)} ${o.name}${o.equipped ? " (on)" : ""}: ${o.perks.join(", ")}`);
  const idle = t.best.loops.unfed.filter(u => t.best.artifactPerks.some(p => p.name === u.name));
  if (idle.length) console.log("  idle perks in best:", idle.map(u => `${u.name} (needs ${u.token})`).join("; "));
}
