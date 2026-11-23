/// <reference lib="webworker" />
// Runs the build search off the main thread so the page never freezes while Steeped thinks.
import type { ItemDef } from "../bungie/defs";
import type { Inventory } from "../model/inventory";
import { searchBuilds, type Require } from "../engine/builds";
import { evaluate, makeCtx, specFromBuild, type BuildSpec, type Ctx, type Settings } from "../engine/evaluate";
import type { Goal } from "../engine/loops";
import type { Subclass } from "../knowledge/hunter";
import type { CatalogEntry } from "../bungie/catalog";
import { maxHunter, type MaxHunter } from "../engine/maxhunter";
import { withCatalog } from "../engine/catalog";
import { loadClarity } from "../bungie/clarity";

// Clarity's tested numbers (when switched on) must be in place before any perk is read.
const clarityReady = loadClarity();

export interface SearchRequest {
  id: number;
  inv: Inventory;
  defs: ItemDef[];
  characterId: string;
  goal: Goal;
  top: number;
  onlySubclass?: Subclass;
  onlyExotic?: string;
  pinnedWeapons?: string[];
  require?: Require;
  catalog?: CatalogEntry[]; // when given, gear you don't own joins the search as stand-ins ("best possible")
  settings?: Settings; // when given, the finalists are ranked by their full rating (armor, stats and your targets included)
}
export interface SearchResponse { id: number; specs?: BuildSpec[]; max?: MaxHunter; error?: string; ms: number }
export interface MaxRequest { id: number; kind: "max"; inv: Inventory; defs: ItemDef[]; characterId: string; catalog: CatalogEntry[]; withBest: boolean }

let cache: { inv: Inventory; defs: ItemDef[]; map: Map<number, ItemDef>; ctx?: Ctx; cid?: string; all?: Inventory; allCtx?: Ctx; allSize?: number } | null = null;

self.onmessage = async (e: MessageEvent<SearchRequest | MaxRequest>) => {
  await clarityReady;
  const t = performance.now();
  if ("kind" in e.data && e.data.kind === "max") {
    const m = e.data;
    try {
      const map = new Map(m.defs.map(d => [d.hash, d]));
      const max = maxHunter(m.inv, h => map.get(h), m.defs, m.characterId, m.catalog, undefined, m.withBest);
      (self as unknown as Worker).postMessage({ id: m.id, max, ms: performance.now() - t } satisfies SearchResponse);
    } catch (err) {
      (self as unknown as Worker).postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err), ms: performance.now() - t } satisfies SearchResponse);
    }
    return;
  }
  const r = e.data as SearchRequest;
  try {
    if (!cache || cache.inv !== r.inv || cache.defs.length !== r.defs.length) cache = { inv: r.inv, defs: r.defs, map: new Map(r.defs.map(d => [d.hash, d])) };
    let inv = r.inv;
    if (r.catalog?.length) {
      if (!cache.all || cache.cid !== r.characterId || cache.allSize !== r.catalog.length) { cache.allSize = r.catalog.length; cache.all = withCatalog(r.inv, h => cache!.map.get(h), r.catalog, r.characterId).inv; cache.allCtx = undefined; cache.ctx = undefined; cache.cid = r.characterId; }
      inv = cache.all;
    }
    const builds = searchBuilds({
      inv, defOf: h => cache!.map.get(h), defs: r.defs, characterId: r.characterId, goal: r.goal, top: r.settings ? Math.max(r.top, 8) : r.top,
      onlySubclass: r.onlySubclass, onlyExotic: r.onlyExotic, pinnedWeapons: r.pinnedWeapons, require: r.require,
    });
    let specs = builds.map(specFromBuild);
    if (r.settings) {
      // The search ranks on how well pieces work together; the armor decides the stats. Rank finalists on both.
      if (inv !== r.inv) { if (!cache.allCtx) cache.allCtx = makeCtx(inv, h => cache!.map.get(h), r.defs, r.characterId); }
      else if (!cache.ctx || cache.cid !== r.characterId) { cache.ctx = makeCtx(r.inv, h => cache!.map.get(h), r.defs, r.characterId); cache.cid = r.characterId; }
      const ctx = inv !== r.inv ? cache.allCtx! : cache.ctx!;
      specs = specs.map(s => ({ s, v: evaluate({ ...s, goal: r.goal }, ctx, r.settings!) }))
        .sort((a, b) => (b.v.armor ? 1 : 0) - (a.v.armor ? 1 : 0) || a.v.issues.length - b.v.issues.length || b.v.score - a.v.score)
        .map(x => x.s).slice(0, r.top);
    }
    (self as unknown as Worker).postMessage({ id: r.id, specs, ms: performance.now() - t } satisfies SearchResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: r.id, error: err instanceof Error ? err.message : String(err), ms: performance.now() - t } satisfies SearchResponse);
  }
};
