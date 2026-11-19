import {
  BUCKET, CLASS_NAME, DAMAGE, STAT_HASH, STAT_ORDER, VAULT_BUCKET, ARTIFACT_BUCKET,
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
  reusable: Record<number, number[]>; // socket index -> plugs you can swap in (weapons; Bungie's list)
  options: Record<number, number[]>; // socket index -> unlocked plugs from your plug sets (subclasses, armor mods)
}

export interface Inventory {
  account: { name: string; membershipType: number; membershipId: string };
  characters: Character[];
  items: Item[];
  collectibles: Record<number, number>; // collectible hash -> state (bit 1 = not acquired)
  vaultCount: number;
  loadedAt: number;
  artifacts: Record<string, { name: string; perks: number[] }>; // character id -> equipped artifact and its active perk plugs
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
    const options: Record<number, number[]> = {};
    if (kind === "subclass" || kind === "armor")
      d.sockets.forEach((s, idx) => { const o = unlockedPlugSet(P, s.reusable, owner === "vault" ? undefined : owner); if (o.length) options[idx] = o; });
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
      options,
    });
  }

  const collectibles: Record<number, number> = {};
  for (const [h, c] of Object.entries(P.profileCollectibles?.data?.collectibles ?? {})) collectibles[Number(h)] = (c as any).state ?? 0;
  for (const cc of Object.values(P.characterCollectibles?.data ?? {}))
    for (const [h, c] of Object.entries((cc as any).collectibles ?? {})) {
      const st = (c as any).state ?? 0;
      collectibles[Number(h)] = h in collectibles ? Math.min(collectibles[Number(h)], st) : st;
    }

  // The seasonal artifact sits in its own equipment bucket; its sockets are the perks you picked.
  const artifacts: Inventory["artifacts"] = {};
  for (const cid of Object.keys(chars))
    for (const it of P.characterEquipment?.data?.[cid]?.items ?? []) {
      if (it.bucketHash !== ARTIFACT_BUCKET) continue;
      const perks = (sockets[String(it.itemInstanceId ?? "")]?.sockets ?? []).map((x: any) => x.plugHash ?? 0).filter(Boolean);
      artifacts[cid] = { name: defOf(it.itemHash)?.name ?? "Artifact", perks };
    }

  return {
    account, characters, items, collectibles, artifacts,
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
// Plug sets: what you've unlocked for each subclass socket (and armor mod sockets), keyed by plug set hash.
export function unlockedPlugSet(P: any, setHash: number, characterId?: string): number[] {
  if (!setHash) return [];
  const list: any[] = (characterId && P.characterPlugSets?.data?.[characterId]?.plugs?.[setHash])
    ?? P.profilePlugSets?.data?.plugs?.[setHash] ?? [];
  return list.filter(p => p.canInsert !== false && p.enabled !== false).map(p => p.plugItemHash).filter(Boolean);
}

// Plug hashes behind the subclass and armor sockets of items we own (needs item definitions loaded first).
export const plugSetHashes = (P: any, defOf: (h: number) => ItemDef | undefined): number[] => {
  const out = new Set<number>();
  const visit = (it: any, cid?: string) => {
    const d = defOf(it.itemHash);
    if (!d || !(d.bucket in BUCKET)) return;
    const slot = BUCKET[d.bucket];
    if (slot !== "subclass" && !["helmet", "arms", "chest", "legs", "class"].includes(slot)) return;
    for (const s of d.sockets) {
      for (const h of unlockedPlugSet(P, s.reusable, cid)) out.add(h);
      // Subclass plug sets: Bungie's unlock flags are unreliable there, so load every option's name.
      if (slot === "subclass") {
        const list: any[] = (cid && P.characterPlugSets?.data?.[cid]?.plugs?.[s.reusable]) ?? P.profilePlugSets?.data?.plugs?.[s.reusable] ?? [];
        for (const p of list) if (p.plugItemHash) out.add(p.plugItemHash);
      }
    }
  };
  for (const it of P.profileInventory?.data?.items ?? []) visit(it);
  for (const g of [P.characterInventories?.data, P.characterEquipment?.data])
    for (const [cid, c] of Object.entries(g ?? {})) for (const it of (c as any).items ?? []) visit(it, cid);
  return [...out];
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
