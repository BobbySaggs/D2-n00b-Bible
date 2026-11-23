import { clear, createStore, getMany, setMany } from "idb-keyval";
import { api } from "./api";

// Trimmed DestinyInventoryItemDefinition. Cached forever in this browser (IndexedDB).
// Bump DEF_VERSION when the shape changes so old entries are refetched.
export const DEF_VERSION = 3; // 2: plug text from sandbox perks; 3: armor set bonuses

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
  setHash?: number; // armor: the set it belongs to
  set?: ArmorSet; // filled in when loaded: the set's name and its 2- and 4-piece bonuses
}
export interface ArmorSet { hash: number; name: string; perks: { count: number; hash: number; name: string; desc: string }[] }

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
    setHash: (d.equippingBlock || {}).equipableItemSetHash || undefined,
  };
}

const store = typeof indexedDB !== "undefined" ? createStore("steeped", "defs") : null;
export const DEFS = new Map<number, ItemDef>();

// Bungie bumps the manifest version whenever a patch changes item or perk text. Saved definitions from an
// older version are dropped so descriptions are always the current ones. If the check fails, keep going.
const VERSION_KEY = "steeped-manifest-version";
export async function syncManifestVersion(): Promise<"same" | "changed" | "unknown"> {
  try {
    const m: any = await api("/Destiny2/Manifest/");
    const v = String(m?.version ?? "");
    if (!v) return "unknown";
    const was = localStorage.getItem(VERSION_KEY);
    localStorage.setItem(VERSION_KEY, v);
    if (was && was !== v) {
      DEFS.clear();
      if (store) await clear(store).catch(() => undefined);
      return "changed";
    }
    return "same";
  } catch { return "unknown"; }
}

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
        // Aspects, fragments, abilities and mods keep their rules text on sandbox perks, not the item.
        if (!t.desc && t.plugCat && t.perks.length) t.desc = await perkText(t.perks);
        if (t.setHash) t.set = await setOf(t.setHash);
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

// Armor sets: name plus each bonus (pieces needed, name, Bungie's description). Fetched once per set.
const SETS = new Map<number, Promise<ArmorSet | undefined>>();
function setOf(h: number): Promise<ArmorSet | undefined> {
  let p = SETS.get(h);
  if (!p) {
    p = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d: any = await api(`/Destiny2/Manifest/DestinyEquipableItemSetDefinition/${h}/`);
        const perks: ArmorSet["perks"] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const sp of (d?.setPerks ?? []) as any[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pd: any = await api(`/Destiny2/Manifest/DestinySandboxPerkDefinition/${sp.sandboxPerkHash}/`).catch(() => null);
          perks.push({ count: sp.requiredSetCount, hash: sp.sandboxPerkHash, name: String(pd?.displayProperties?.name ?? ""), desc: String(pd?.displayProperties?.description ?? "").replace(/\s+/g, " ").trim() });
        }
        return { hash: h, name: String(d?.displayProperties?.name ?? ""), perks };
      } catch {
        return undefined;
      }
    })();
    SETS.set(h, p);
  }
  return p;
}

async function perkText(perks: number[]): Promise<string> {
  const out: string[] = [];
  for (const p of perks.slice(0, 4)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = await api(`/Destiny2/Manifest/DestinySandboxPerkDefinition/${p}/`);
      const t = String(d?.displayProperties?.description || "").replace(/\s+/g, " ").trim();
      if (d?.isDisplayable !== false && t && !out.includes(t)) out.push(t);
    } catch {
      /* skip */
    }
  }
  return out.join(" ");
}
