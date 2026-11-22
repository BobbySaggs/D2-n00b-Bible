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
  settings?: Settings; // when given, the finalists are ranked by their full rating (armor, stats and your targets included)
}
export interface SearchResponse { id: number; specs?: BuildSpec[]; max?: MaxHunter; error?: string; ms: number }
export interface MaxRequest { id: number; kind: "max"; inv: Inventory; defs: ItemDef[]; characterId: string; catalog: CatalogEntry[]; withBest: boolean }

let cache: { inv: Inventory; defs: ItemDef[]; map: Map<number, ItemDef>; ctx?: Ctx; cid?: string } | null = null;

self.onmessage = (e: MessageEvent<SearchRequest | MaxRequest>) => {
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
    if (!cache || cache.inv !== r.inv) cache = { inv: r.inv, defs: r.defs, map: new Map(r.defs.map(d => [d.hash, d])) };
    const builds = searchBuilds({
      inv: r.inv, defOf: h => cache!.map.get(h), defs: r.defs, characterId: r.characterId, goal: r.goal, top: r.settings ? Math.max(r.top, 8) : r.top,
      onlySubclass: r.onlySubclass, onlyExotic: r.onlyExotic, pinnedWeapons: r.pinnedWeapons, require: r.require,
    });
    let specs = builds.map(specFromBuild);
    if (r.settings) {
      // The search ranks on how well pieces work together; the armor decides the stats. Rank finalists on both.
      if (!cache.ctx || cache.cid !== r.characterId) { cache.ctx = makeCtx(r.inv, h => cache!.map.get(h), r.defs, r.characterId); cache.cid = r.characterId; }
      const ctx = cache.ctx;
      specs = specs.map(s => ({ s, v: evaluate({ ...s, goal: r.goal }, ctx, r.settings!) }))
        .sort((a, b) => (b.v.armor ? 1 : 0) - (a.v.armor ? 1 : 0) || a.v.issues.length - b.v.issues.length || b.v.score - a.v.score)
        .map(x => x.s).slice(0, r.top);
    }
    (self as unknown as Worker).postMessage({ id: r.id, specs, ms: performance.now() - t } satisfies SearchResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: r.id, error: err instanceof Error ? err.message : String(err), ms: performance.now() - t } satisfies SearchResponse);
  }
};
