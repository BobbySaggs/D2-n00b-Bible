import {
  BUCKET, CLASS_NAME, DAMAGE, STAT_HASH, STAT_ORDER, VAULT_BUCKET,
  type ClassName, type Slot, type StatKey,
} from "../bungie/config";
import type { ItemDef } from "../bungie/defs";

// Everything the engine needs, built only from Bungie's profile response plus item definitions.
// Pure function: the same code runs on live data and on a saved snapshot (tests).

export type Stats = Record<StatKey, number>;
export const zeroStats = (): Stats => ({ health: 0, melee: 0, grenade: 0, super: 0, class: 0, weapons: 0 });

export interface Character {
  id: string;
  cls: ClassName;
  light: number;
  stats: Stats; // what the character screen shows
  lastPlayed: string;
  emblem: string;
}

export interface Item {
  id: string; // instance id ("" for stackables)
  hash: number;
  name: string;
  slot: Slot | null;
  kind: "armor" | "weapon" | "subclass" | "other";
  cls: ClassName | "Any";
  exotic: boolean;
  owner: string; // character id or "vault"
  equipped: boolean;
  power: number;
  damage: string;
  locked: boolean;
  masterworked: boolean; // Bungie's masterwork flag; Armor 3.0 detection is refined in the engine
  gearTier: number; // Armor 3.0 / weapon tier, 0 if Bungie didn't send it
  energy: number; // armor energy capacity
  stats: Stats; // armor: current stats incl. mods
  plugs: number[]; // plugged hash per socket index (0 = empty)
  reusable: Record<number, number[]>; // socket index -> plugs you can swap in (subclasses, weapons)
}

export interface Inventory {
  account: { name: string; membershipType: number; membershipId: string };
  characters: Character[];
  items: Item[];
  collectibles: Record<number, number>; // collectible hash -> state (bit 1 = not acquired)
  vaultCount: number;
  loadedAt: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const statsFrom = (byHash: Record<string, { value?: number }> | undefined): Stats => {
  const s = zeroStats();
  if (!byHash) return s;
  for (const k of STAT_ORDER) s[k] = byHash[STAT_HASH[k]]?.value ?? 0;
  return s;
};

export function buildInventory(
  P: any,
  defOf: (h: number) => ItemDef | undefined,
  account: Inventory["account"],
): Inventory {
  const chars: Record<string, any> = P.characters?.data ?? {};
  const characters: Character[] = Object.values(chars)
    .map((c: any) => ({
      id: String(c.characterId),
      cls: CLASS_NAME[c.classType] ?? "Hunter",
      light: c.light ?? 0,
      stats: statsFrom(Object.fromEntries(Object.entries(c.stats ?? {}).map(([k, v]) => [k, { value: v as number }]))),
      lastPlayed: c.dateLastPlayed ?? "",
      emblem: c.emblemPath ?? "",
    }))
    .sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed));

  const raw: [any, string, boolean][] = [];
  for (const it of P.profileInventory?.data?.items ?? []) raw.push([it, "vault", false]);
  for (const cid of Object.keys(chars)) {
    for (const it of P.characterInventories?.data?.[cid]?.items ?? []) raw.push([it, cid, false]);
    for (const it of P.characterEquipment?.data?.[cid]?.items ?? []) raw.push([it, cid, true]);
  }

  const IC = P.itemComponents ?? {};
  const inst = IC.instances?.data ?? {}, stats = IC.stats?.data ?? {}, sockets = IC.sockets?.data ?? {},
    reusable = IC.reusablePlugs?.data ?? {};

  const items: Item[] = [];
  for (const [it, owner, equipped] of raw) {
    const d = defOf(it.itemHash);
    if (!d || !d.name) continue;
    const slot = BUCKET[d.bucket] ?? null;
    const kind: Item["kind"] = slot === "subclass" ? "subclass"
      : slot && ["helmet", "arms", "chest", "legs", "class"].includes(slot) ? "armor"
      : slot && ["kinetic", "energy", "power"].includes(slot) ? "weapon" : "other";
    if (kind === "other") continue; // engrams, consumables, mods, quests
    const id = String(it.itemInstanceId ?? "");
    const ins = inst[id] ?? {};
    const reu: Record<number, number[]> = {};
    for (const [idx, list] of Object.entries(reusable[id]?.plugs ?? {}))
      reu[Number(idx)] = (list as any[]).map(p => p.plugItemHash).filter(Boolean);
    items.push({
      id, hash: it.itemHash, name: d.name, slot, kind,
      cls: d.cls in CLASS_NAME ? CLASS_NAME[d.cls] : "Any",
      exotic: d.tier === 6,
      owner, equipped,
      power: ins.primaryStat?.value ?? 0,
      damage: DAMAGE[ins.damageTypeHash ?? d.damage] ?? "",
      locked: !!(it.state & 1),
      masterworked: !!(it.state & 4),
      gearTier: ins.gearTier ?? 0,
      energy: ins.energy?.energyCapacity ?? 0,
      stats: kind === "armor" ? statsFrom(stats[id]?.stats) : zeroStats(),
      plugs: (sockets[id]?.sockets ?? []).map((s: any) => s.plugHash ?? 0),
      reusable: reu,
    });
  }

  const collectibles: Record<number, number> = {};
  for (const [h, c] of Object.entries(P.profileCollectibles?.data?.collectibles ?? {})) collectibles[Number(h)] = (c as any).state ?? 0;
  for (const cc of Object.values(P.characterCollectibles?.data ?? {}))
    for (const [h, c] of Object.entries((cc as any).collectibles ?? {})) {
      const st = (c as any).state ?? 0;
      collectibles[Number(h)] = h in collectibles ? Math.min(collectibles[Number(h)], st) : st;
    }

  return {
    account, characters, items, collectibles,
    vaultCount: (P.profileInventory?.data?.items ?? []).filter((x: any) => x.bucketHash === VAULT_BUCKET).length,
    loadedAt: Date.now(),
  };
}

// Every hash we need definitions for, in two passes: items first, then their plugs.
export const itemHashes = (P: any): number[] => {
  const out: number[] = [];
  for (const it of P.profileInventory?.data?.items ?? []) out.push(it.itemHash);
  for (const g of [P.characterInventories?.data, P.characterEquipment?.data])
    for (const c of Object.values(g ?? {})) for (const it of (c as any).items ?? []) out.push(it.itemHash);
  return out;
};
export const plugHashes = (P: any): number[] => {
  const out: number[] = [];
  for (const s of Object.values(P.itemComponents?.sockets?.data ?? {}))
    for (const x of (s as any).sockets ?? []) if (x.plugHash) out.push(x.plugHash);
  for (const r of Object.values(P.itemComponents?.reusablePlugs?.data ?? {}))
    for (const list of Object.values((r as any).plugs ?? {})) for (const p of list as any[]) if (p.plugItemHash) out.push(p.plugItemHash);
  return out;
};
/* eslint-enable @typescript-eslint/no-explicit-any */
