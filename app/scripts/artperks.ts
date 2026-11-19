import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { perkKnowledge } from "../src/knowledge/artifact";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
for (const d of Object.values<any>(s.defs)) {
  if (d.plugCat !== "artifact_perks" || /Empty/.test(d.name)) continue;
  const k = perkKnowledge(d.hash, d.name, d.desc ?? "");
  if (k.read === "checked" && !process.argv[3]) continue;
  console.log(`${k.name} [${k.read}] makes=${k.makes.join(",")} uses=${k.uses.join(",")} needs=${(k.needs ?? []).join(",")}`);
}
