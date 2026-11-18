import { createStore, getMany, setMany } from "idb-keyval";
import { api } from "./api";

// Trimmed DestinyInventoryItemDefinition. Cached forever in this browser (IndexedDB).
// Bump DEF_VERSION when the shape changes so old entries are refetched.
export const DEF_VERSION = 1;

export interface ItemDef {
  v: number;
  hash: number;
  name: string;
  desc: string;
  type: string; // itemTypeDisplayName
  itemType: number;
  subType: number;
  tier: number; // 6 exotic, 5 legendary
  cls: number; // 0 Titan, 1 Hunter, 2 Warlock, 3 any
  bucket: number;
  damage: number;
  ammo: number; // 1 primary, 2 special, 3 heavy
  breaker: number;
  icon: string;
  plugCat: string;
  energy: number;
  stats: [number, number, number][]; // [statHash, value, conditional]
  sockets: { type: number; init: number; reusable: number; random: number }[];
  perks: number[]; // sandbox perk hashes (plugs)
  collectible: number;
  traits: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function trim(d: any, hash: number): ItemDef {
  const dp = d.displayProperties || {};
  return {
    v: DEF_VERSION,
    hash,
    name: dp.name || "",
    desc: String(dp.description || "").replace(/\s+/g, " ").trim(),
    type: d.itemTypeDisplayName || "",
    itemType: d.itemType || 0,
    subType: d.itemSubType || 0,
    tier: (d.inventory || {}).tierType || 0,
    cls: d.classType ?? 3,
    bucket: (d.inventory || {}).bucketTypeHash || 0,
    damage: d.defaultDamageTypeHash || 0,
    ammo: (d.equippingBlock || {}).ammoType || 0,
    breaker: d.breakerTypeHash || 0,
    icon: dp.icon || "",
    plugCat: (d.plug || {}).plugCategoryIdentifier || "",
    energy: (((d.plug || {}).energyCost) || {}).energyCost || 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stats: (d.investmentStats || []).filter((x: any) => x.value).map((x: any) => [x.statTypeHash, x.value, x.isConditionallyActive ? 1 : 0]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sockets: ((d.sockets || {}).socketEntries || []).map((s: any) => ({
      type: s.socketTypeHash || 0, init: s.singleInitialItemHash || 0,
      reusable: s.reusablePlugSetHash || 0, random: s.randomizedPlugSetHash || 0,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    perks: (d.perks || []).map((p: any) => p.perkHash).filter(Boolean),
    collectible: d.collectibleHash || 0,
    traits: d.traitIds || [],
  };
}

const store = typeof indexedDB !== "undefined" ? createStore("steeped", "defs") : null;
export const DEFS = new Map<number, ItemDef>();

// Loads definitions for every hash, from cache first, then Bungie (a few at a time).
export async function loadDefs(hashes: number[], onProgress?: (done: number, total: number) => void) {
  const want = [...new Set(hashes.filter(h => h && !DEFS.has(h)))];
  if (store && want.length) {
    const cached = await getMany<ItemDef | undefined>(want, store).catch(() => []);
    cached.forEach((d, i) => { if (d && d.v === DEF_VERSION) DEFS.set(want[i], d); });
  }
  const missing = want.filter(h => !DEFS.has(h));
  let done = 0;
  const fresh: [number, ItemDef][] = [];
  const queue = [...missing];
  const worker = async () => {
    for (let h = queue.shift(); h !== undefined; h = queue.shift()) {
      try {
        const d = await api(`/Destiny2/Manifest/DestinyInventoryItemDefinition/${h}/`);
        const t = trim(d, h);
        DEFS.set(h, t);
        fresh.push([h, t]);
      } catch {
        /* unknown or redacted item: skip */
      }
      done++;
      onProgress?.(done, missing.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(12, missing.length) }, worker));
  if (store && fresh.length) await setMany(fresh, store).catch(() => {});
}

export const def = (h: number) => DEFS.get(h);
