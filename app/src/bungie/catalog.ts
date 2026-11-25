import { createStore, get, set } from "idb-keyval";
import { api } from "./api";
import { BNET } from "./config";
import { def, loadDefs } from "./defs";

// Every exotic in the game that a Hunter can use (Hunter exotic armor and all exotic weapons), owned or not,
// read from Bungie's Collections. "Best possible" builds use these. Bungie's own source text says where each drops.
export interface CatalogEntry {
  hash: number; // item hash
  collectible: number;
  source: string; // Bungie's "Source: ..." line
  acquired: boolean; // unlocked in your Collections (you can pull it from there if you dismantled it)
  // Legendary weapons that can drop now (with gear tiers): every perk each socket can roll, by socket index.
  rolls?: number[][];
}

// The marker on weapons that drop with gear tiers today. Older guns without it can't drop at Tier 5 any more.
export const TIER_SOCKET = "weapon_tiering.plugs.mods.enhancers";
const NO_SOURCE = /cannot be reacquired|^$/i;

type Cached = { version: string; entries: CatalogEntry[]; catalysts?: CatalystDef[]; legendary?: boolean; classes?: number };
// Bump when the catalog covers more classes, so old caches (Hunter only) are rebuilt once.
const CLASSES_V = 2;
const store = typeof indexedDB !== "undefined" ? createStore("steeped-catalog", "v1") : null;
let CATALOG: CatalogEntry[] = [];
export const getCatalog = () => CATALOG;

// Exotic catalysts: Bungie tracks each one as a record under Collections/Triumphs "Exotic Catalysts".
export interface CatalystDef { record: number; name: string }
export interface Catalyst { record: number; name: string; weapon: string; done: boolean; progress: string }
let CATALYST_DEFS: CatalystDef[] = [];
export function readCatalysts(profile: any): Catalyst[] {
  const recs: Record<string, any> = { ...(profile?.profileRecords?.data?.records ?? {}) };
  for (const c of Object.values(profile?.characterRecords?.data ?? {}) as any[]) for (const [h, v] of Object.entries(c.records ?? {})) if (!(h in recs)) recs[h] = v;
  return CATALYST_DEFS.map(d => {
    const r = recs[d.record];
    const objs: any[] = r?.objectives ?? r?.intervalObjectives ?? [];
    const done = r ? (r.state & 4) === 0 : false; // 4 = objective not completed
    const progress = objs.length && !done ? objs.map(o => `${o.progress ?? 0} of ${o.completionValue ?? "?"}`).join(", ") : "";
    return { record: d.record, name: d.name, weapon: d.name.replace(/\s*Catalyst$/i, ""), done, progress };
  });
}
function catalystRecords(nodes: Record<string, any>): number[] {
  const name = (h: number | string) => String(nodes[h]?.displayProperties?.name ?? "").trim();
  const roots = Object.keys(nodes).filter(h => /^(exotic )?catalysts$/i.test(name(h)));
  const out = new Set<number>();
  const walk = (h: number | string, depth: number) => {
    const n = nodes[h];
    if (!n || depth > 5) return;
    for (const r of n.children?.records ?? []) out.add(r.recordHash);
    for (const c of n.children?.presentationNodes ?? []) walk(c.presentationNodeHash, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return [...out];
}
async function catalystDefs(hashes: number[], progress?: (m: string) => void): Promise<CatalystDef[]> {
  const out: CatalystDef[] = [];
  for (let i = 0; i < hashes.length; i += 12) {
    progress?.(`Reading exotic catalysts (${Math.min(i + 12, hashes.length)} of ${hashes.length})`);
    const got = await Promise.all(hashes.slice(i, i + 12).map(h => api<any>(`/Destiny2/Manifest/DestinyRecordDefinition/${h}/`).catch(() => null)));
    for (const d of got) if (d?.hash && d.displayProperties?.name) out.push({ record: d.hash, name: d.displayProperties.name });
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function table(path: string): Promise<Record<string, any>> {
  const r = await fetch(BNET + path);
  if (!r.ok) throw new Error(`Bungie returned HTTP ${r.status} for ${path}`);
  return r.json();
}

// Collectibles under Collections > Exotic, every class (each character only gets its own class's armor later).
function exoticCollectibles(nodes: Record<string, any>): number[] {
  const name = (h: number | string) => String(nodes[h]?.displayProperties?.name ?? "").trim();
  const roots = Object.keys(nodes).filter(h => /^exotics?$/i.test(name(h)));
  const out = new Set<number>();
  const walk = (h: number | string, depth: number) => {
    const n = nodes[h];
    if (!n || depth > 6) return;
    for (const c of n.children?.collectibles ?? []) out.add(c.collectibleHash);
    for (const c of n.children?.presentationNodes ?? []) walk(c.presentationNodeHash, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return [...out];
}

export async function loadCatalog(profile: any, progress?: (msg: string) => void): Promise<CatalogEntry[]> {
  const m: any = await api("/Destiny2/Manifest/");
  const version = String(m?.version ?? "");
  if (store) {
    const cached = await get<Cached>("catalog", store).catch(() => undefined);
    if (cached && cached.version === version && cached.entries.length && cached.catalysts && cached.classes === CLASSES_V) {
      CATALYST_DEFS = cached.catalysts;
      CATALOG = withStates(cached.entries, profile);
      await loadDefs([...CATALOG.map(e => e.hash)]);
      await loadDefs([...plugsOf(CATALOG), ...CATALOG.flatMap(e => (e.rolls ?? []).flat())]);
      return CATALOG;
    }
  }
  const paths = m?.jsonWorldComponentContentPaths?.en ?? {};
  if (!paths.DestinyCollectibleDefinition || !paths.DestinyPresentationNodeDefinition) throw new Error("Bungie's manifest didn't list Collections");
  progress?.("Reading every exotic in the game (once per Destiny update)");
  const [cols, nodes] = await Promise.all([table(paths.DestinyCollectibleDefinition), table(paths.DestinyPresentationNodeDefinition)]);
  const list = exoticCollectibles(nodes);
  CATALYST_DEFS = await catalystDefs(catalystRecords(nodes), progress).catch(() => []);
  let entries: CatalogEntry[] = list.map(c => cols[c]).filter(Boolean).map((c: any) => ({
    hash: c.itemHash, collectible: c.hash, source: String(c.sourceString ?? "").replace(/^Source:\s*/i, "").trim(), acquired: false,
  })).filter(e => e.hash);
  await loadDefs(entries.map(e => e.hash), (d, t) => progress?.(`Reading exotics (${d} of ${t})`));
  entries = entries.filter(e => {
    const d = def(e.hash);
    return d && d.tier === 6 && (d.itemType === 3 || (d.itemType === 2 && d.cls <= 2));
  });
  await loadDefs(plugsOf(entries), (d, t) => progress?.(`Reading exotic perks (${d} of ${t})`));
  if (store) await set("catalog", { version, entries, catalysts: CATALYST_DEFS, classes: CLASSES_V } satisfies Cached, store).catch(() => undefined);
  CATALOG = withStates(entries, profile);
  return CATALOG;
}

// Collections > Weapons (the legendary side: Primary, Special, Heavy), skipping ornaments.
function legendaryCollectibles(nodes: Record<string, any>): number[] {
  const name = (h: number | string) => String(nodes[h]?.displayProperties?.name ?? "").trim();
  const kids = (h: number | string) => (nodes[h]?.children?.presentationNodes ?? []).map((c: any) => name(c.presentationNodeHash));
  const roots = Object.keys(nodes).filter(h => /^weapons$/i.test(name(h)) && kids(h).some((k: string) => /^(primary|special|heavy)$/i.test(k)));
  const out = new Set<number>();
  const walk = (h: number | string, depth: number) => {
    const n = nodes[h];
    if (!n || depth > 6 || /ornament/i.test(name(h))) return;
    for (const c of n.children?.collectibles ?? []) out.add(c.collectibleHash);
    for (const c of n.children?.presentationNodes ?? []) walk(c.presentationNodeHash, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return [...out];
}

// Adds every legendary weapon that can drop today, with every perk it can roll, so "Best possible" can find the
// god roll you don't have yet. Runs after the app is up (it reads a few thousand definitions the first time,
// then nothing until the next Destiny update). Returns the full catalog, or null when it was already there.
export async function extendCatalog(profile: any, progress?: (msg: string) => void): Promise<CatalogEntry[] | null> {
  const m: any = await api("/Destiny2/Manifest/");
  const version = String(m?.version ?? "");
  const cached = store ? await get<Cached>("catalog", store).catch(() => undefined) : undefined;
  if (cached?.legendary && cached.version === version && cached.classes === CLASSES_V) return null;
  const paths = m?.jsonWorldComponentContentPaths?.en ?? {};
  if (!paths.DestinyCollectibleDefinition || !paths.DestinyPresentationNodeDefinition || !paths.DestinyPlugSetDefinition) return null;
  progress?.("Reading every legendary weapon (once per Destiny update)");
  const [cols, nodes, sets] = await Promise.all([table(paths.DestinyCollectibleDefinition), table(paths.DestinyPresentationNodeDefinition), table(paths.DestinyPlugSetDefinition)]);
  let legs: CatalogEntry[] = legendaryCollectibles(nodes).map(c => cols[c]).filter(Boolean).map((c: any) => {
    const src = String(c.sourceString ?? "").trim();
    return { hash: c.itemHash, collectible: c.hash, source: NO_SOURCE.test(src) ? "Random world and activity drop" : src.replace(/^Source:\s*/i, ""), acquired: false };
  }).filter(e => e.hash);
  await loadDefs(legs.map(e => e.hash), (d, t) => progress?.(`Reading legendary weapons (${d} of ${t})`));
  legs = legs.filter(e => { const d = def(e.hash); return d && d.tier === 5 && d.itemType === 3; });
  await loadDefs(plugsOf(legs));
  legs = legs.filter(e => def(e.hash)!.sockets.some(s => def(s.init)?.plugCat === TIER_SOCKET));
  for (const e of legs) {
    e.rolls = def(e.hash)!.sockets.map(s => {
      const items: any[] = s.random ? sets[s.random]?.reusablePlugItems ?? [] : [];
      return [...new Set(items.filter(p => p.currentlyCanRoll !== false).map(p => Number(p.plugItemHash)))];
    });
  }
  await loadDefs(legs.flatMap(e => e.rolls!.flat()), (d, t) => progress?.(`Reading weapon perks (${d} of ${t})`));
  const base = (cached?.version === version ? cached.entries : CATALOG).filter(e => !e.rolls);
  const entries = [...base, ...legs];
  if (store) await set("catalog", { version, entries, catalysts: CATALYST_DEFS, legendary: true, classes: CLASSES_V } satisfies Cached, store).catch(() => undefined);
  CATALOG = withStates(entries, profile);
  return CATALOG;
}

const plugsOf = (entries: CatalogEntry[]) => entries.flatMap(e => (def(e.hash)?.sockets ?? []).map(s => s.init)).filter(Boolean);

function withStates(entries: CatalogEntry[], profile: any): CatalogEntry[] {
  const states: Record<string, number> = { ...(profile?.profileCollectibles?.data?.collectibles ?? {}) } as any;
  for (const c of Object.values(profile?.characterCollectibles?.data ?? {}) as any[])
    for (const [h, v] of Object.entries(c.collectibles ?? {})) if (!(h in states)) states[h] = v as any;
  return entries.map(e => {
    const st = (states[e.collectible] as any)?.state;
    return { ...e, acquired: !e.rolls && st !== undefined && (st & 1) === 0 }; // random-roll legendaries can't be pulled
  });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
