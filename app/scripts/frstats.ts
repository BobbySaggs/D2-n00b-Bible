import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const N: Record<number, string> = { 392767087: "Health", 4244567218: "Melee", 1735777505: "Grenade", 144602215: "Super", 1943323491: "Class", 2996146975: "Weapons" };
for (const d of Object.values<any>(s.defs)) if (/Whisper of/.test(d.name) && d.stats?.length) { const st = d.stats.filter(([h]: any) => N[h]).map(([h, v]: any) => `${N[h]} ${v}`); if (st.length) console.log(d.name, st.join(", ")); }
