/// <reference lib="webworker" />
// Runs the build search off the main thread so the page never freezes while Steeped thinks.
import type { ItemDef } from "../bungie/defs";
import type { Inventory } from "../model/inventory";
import { searchBuilds } from "../engine/builds";
import { specFromBuild, type BuildSpec } from "../engine/evaluate";
import type { Goal } from "../engine/loops";
import type { Subclass } from "../knowledge/hunter";

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
}
export interface SearchResponse { id: number; specs?: BuildSpec[]; error?: string; ms: number }

let cache: { inv: Inventory; defs: ItemDef[]; map: Map<number, ItemDef> } | null = null;

self.onmessage = (e: MessageEvent<SearchRequest>) => {
  const r = e.data, t = performance.now();
  try {
    if (!cache || cache.inv !== r.inv) cache = { inv: r.inv, defs: r.defs, map: new Map(r.defs.map(d => [d.hash, d])) };
    const builds = searchBuilds({
      inv: r.inv, defOf: h => cache!.map.get(h), defs: r.defs, characterId: r.characterId, goal: r.goal, top: r.top,
      onlySubclass: r.onlySubclass, onlyExotic: r.onlyExotic, pinnedWeapons: r.pinnedWeapons,
    });
    (self as unknown as Worker).postMessage({ id: r.id, specs: builds.map(specFromBuild), ms: performance.now() - t } satisfies SearchResponse);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: r.id, error: err instanceof Error ? err.message : String(err), ms: performance.now() - t } satisfies SearchResponse);
  }
};
