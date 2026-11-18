import type { ItemDef } from "../bungie/defs";
import type { Inventory } from "../model/inventory";
import type { BuildSpec } from "../engine/evaluate";
import type { SearchRequest, SearchResponse } from "./search.worker";

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
