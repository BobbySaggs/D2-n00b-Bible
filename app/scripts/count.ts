import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { ItemDef } from "../src/bungie/defs";
import { plugSetHashes } from "../src/model/inventory";
const s = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
const defs = new Map<number, ItemDef>(Object.entries(s.defs).map(([h, d]) => [Number(h), d as ItemDef]));
const all = plugSetHashes(s.profile, h => defs.get(h));
console.log("plug set hashes", all.length, "missing defs", all.filter(h => !defs.has(h)).length);
