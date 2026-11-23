// Test data only: rebuild a snapshot's catalog with every legendary weapon that can drop today, using a local
// copy of Bungie's manifest tables (same steps as extendCatalog in the app). Never committed with data.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { trim, type ItemDef } from "../src/bungie/defs";
import { TIER_SOCKET } from "../src/bungie/catalog";

const [snapIn, dir, snapOut] = process.argv.slice(2);
const s = JSON.parse(gunzipSync(readFileSync(snapIn)).toString());
const load = (n: string) => JSON.parse(readFileSync(`${dir}/${n}.json`, "utf8"));
const items: Record<string, any> = {};
for (const p of [1, 2, 3, 4]) Object.assign(items, load(`DestinyInventoryItemDefinition_part${p}`));
const cols = load("DestinyCollectibleDefinition"), nodes = load("DestinyPresentationNodeDefinition"), sets = load("DestinyPlugSetDefinition"), sbx = load("DestinySandboxPerkDefinition");
const defs: Record<string, ItemDef> = s.defs;
const get = (h: number): ItemDef | undefined => {
  if (defs[h]) return defs[h];
  const raw = items[h];
  if (!raw) return undefined;
  const t = trim(raw, h);
  if (!t.desc && t.plugCat && t.perks.length) t.desc = t.perks.map(p => sbx[p]?.displayProperties?.description).filter(Boolean).join("\n");
  defs[h] = t;
  return t;
};
const name = (h: number | string) => String(nodes[h]?.displayProperties?.name ?? "").trim();
const kids = (h: number | string) => (nodes[h]?.children?.presentationNodes ?? []).map((c: any) => name(c.presentationNodeHash));
const roots = Object.keys(nodes).filter(h => /^weapons$/i.test(name(h)) && kids(h).some((k: string) => /^(primary|special|heavy)$/i.test(k)));
const out = new Set<number>();
const walk = (h: number | string, d: number) => {
  const n = nodes[h];
  if (!n || d > 6 || /ornament/i.test(name(h))) return;
  for (const c of n.children?.collectibles ?? []) out.add(c.collectibleHash);
  for (const c of n.children?.presentationNodes ?? []) walk(c.presentationNodeHash, d + 1);
};
roots.forEach(r => walk(r, 0));
const legs: any[] = [];
for (const c of out) {
  const col = cols[c];
  if (!col) continue;
  const d = get(col.itemHash);
  if (!d || d.tier !== 5 || d.itemType !== 3) continue;
  d.sockets.forEach(x => get(x.init));
  if (!d.sockets.some(x => get(x.init)?.plugCat === TIER_SOCKET)) continue;
  const rolls = d.sockets.map(x => [...new Set(((x.random ? sets[x.random]?.reusablePlugItems : []) ?? []).filter((p: any) => p.currentlyCanRoll !== false).map((p: any) => Number(p.plugItemHash)))] as number[]);
  rolls.flat().forEach(h => get(h));
  const src = String(col.sourceString ?? "").trim();
  legs.push({ hash: d.hash, collectible: col.hash, source: /cannot be reacquired|^$/i.test(src) ? "Random world and activity drop" : src.replace(/^Source:\s*/i, ""), acquired: false, rolls });
}
s.catalog = [...(s.catalog ?? []).filter((e: any) => !e.rolls), ...legs];
s.defs = defs;
writeFileSync(snapOut, gzipSync(JSON.stringify(s)));
console.log(`legendaries ${legs.length}, catalog ${s.catalog.length}, defs ${Object.keys(defs).length}`);
