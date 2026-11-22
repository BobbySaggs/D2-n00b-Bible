import type { ItemDef } from "../bungie/defs";
import type { Inventory } from "../model/inventory";
import type { BuildSpec } from "../engine/evaluate";
import type { MaxRequest, SearchRequest, SearchResponse } from "./search.worker";
import type { CatalogEntry } from "../bungie/catalog";
import type { MaxHunter } from "../engine/maxhunter";

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (r: SearchResponse) => void>();

function get(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<SearchResponse>) => { waiting.get(e.data.id)?.(e.data); waiting.delete(e.data.id); };
  }
  return worker;
}

export function runSearch(req: Omit<SearchRequest, "id" | "inv" | "defs">, inv: Inventory, defs: ItemDef[]): Promise<BuildSpec[]> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, r => (r.error ? reject(new Error(r.error)) : resolve(r.specs ?? [])));
    get().postMessage({ ...req, inv, defs, id } satisfies SearchRequest);
  });
}

// The Max Hunter score, path and build reports. Runs several full searches, so it is cached per load.
const maxCache = new Map<string, Promise<MaxHunter>>();
export function runMax(inv: Inventory, defs: ItemDef[], characterId: string, catalog: CatalogEntry[], withBest = true): Promise<MaxHunter> {
  const key = `${inv.loadedAt}:${characterId}:${withBest}`;
  const hit = maxCache.get(key);
  if (hit) return hit;
  const id = nextId++;
  const p = new Promise<MaxHunter>((resolve, reject) => {
    waiting.set(id, r => (r.error || !r.max ? reject(new Error(r.error ?? "No result")) : resolve(r.max)));
    get().postMessage({ kind: "max", inv, defs, characterId, catalog, withBest, id } satisfies MaxRequest);
  });
  maxCache.set(key, p);
  p.catch(() => maxCache.delete(key));
  return p;
}
