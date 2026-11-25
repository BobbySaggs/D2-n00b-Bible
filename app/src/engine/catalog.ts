import { BUCKET, DAMAGE } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import type { CatalogEntry } from "../bungie/catalog";
import type { Inventory, Item } from "../model/inventory";
import { byName } from "../knowledge/hunter";
import { perkKnowledge } from "../knowledge/artifact";
import { readPiece } from "./armor";

// "Best possible": gear you don't own, added as stand-in items so the same search can use it.
// Exotic armor you don't have gets an assumed roll: the stats of your best exotic in that slot, masterworked.
// Exotic weapons come at your Power with their fixed perks. Legendary weapons come as a masterworked Tier 5 drop
// that can roll any of its perks (the search picks the best roll). Each stand-in's owner is "catalog".
export const CATALOG_OWNER = "catalog";
export const isStandIn = (i: { owner: string }) => i.owner === CATALOG_OWNER;

const SOURCES = new Map<string, { source: string; acquired: boolean }>();
export const standInSource = (id: string) => SOURCES.get(id);

export interface StandIn { item: Item; source: string; acquired: boolean; assumedRoll: boolean; from?: string }

export function withCatalog(inv: Inventory, defOf: (h: number) => ItemDef | undefined, entries: CatalogEntry[], characterId: string): { inv: Inventory; standIns: StandIn[] } {
  const ch = inv.characters.find(c => c.id === characterId);
  const light = ch?.light ?? 0;
  const clsNum = ({ Titan: 0, Hunter: 1, Warlock: 2 } as const)[ch?.cls ?? "Hunter"];
  const ownedNames = new Set(inv.items.map(i => i.name));
  const exoticPieces = inv.items.filter(i => i.kind === "armor" && i.exotic && i.cls === (ch?.cls ?? "Hunter"))
    .map(i => readPiece(i, defOf)).filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => total(b.base) - total(a.base));
  const standIns: StandIn[] = [];
  const seen = new Set<number>(); // a few exotics sit in two Collections folders
  for (const e of entries) {
    const d = defOf(e.hash);
    if (!d || seen.has(d.hash)) continue;
    seen.add(d.hash);
    if (e.rolls) {
      // Legendaries join even when you own one: your copy may be a lower tier or a worse roll. Ties go to yours.
      const slot = BUCKET[d.bucket] ?? null;
      if (!slot || d.itemType !== 3) continue;
      const reusable: Record<number, number[]> = {};
      e.rolls.forEach((r, i) => { if (r.length) reusable[i] = r; });
      const item: Item = {
        id: `cat:${d.hash}`, hash: d.hash, name: d.name, slot, kind: "weapon", cls: "Any", exotic: false, owner: CATALOG_OWNER, equipped: false,
        power: light, damage: DAMAGE[d.damage] ?? "", locked: false, masterworked: true, gearTier: 5, energy: 0,
        stats: { health: 0, melee: 0, grenade: 0, super: 0, class: 0, weapons: 0 }, wstats: Object.fromEntries(d.stats.map(([h, v]) => [h, v])),
        plugs: d.sockets.map((s, i) => e.rolls![i]?.[0] ?? s.init), reusable, options: {},
      };
      standIns.push({ item, source: e.source, acquired: false, assumedRoll: false });
      continue;
    }
    if (ownedNames.has(d.name)) continue;
    const slot = BUCKET[d.bucket] ?? null;
    if (!slot) continue;
    if (d.itemType === 2) {
      if (d.cls !== clsNum) continue; // another class's armor
      const tpl = exoticPieces.find(p => p.slot === slot) ?? exoticPieces[0];
      if (!tpl) continue;
      // What the exotic does lives on its intrinsic perk; read it unless it's one Steeped already knows.
      if (!byName.has(d.name)) {
        const intrinsic = d.sockets.map(s => defOf(s.init)).find(x => x?.plugCat === "intrinsics" && x.desc);
        if (intrinsic) byName.set(d.name, { ...perkKnowledge(d.hash, d.name, intrinsic.desc, "exotic"), kind: "exotic" });
      }
      const item: Item = { ...tpl.item, id: `cat:${d.hash}`, hash: d.hash, name: d.name, slot, owner: CATALOG_OWNER, equipped: false, locked: false, masterworked: true, power: light };
      standIns.push({ item, source: e.source, acquired: e.acquired, assumedRoll: true, from: tpl.item.name });
    } else if (d.itemType === 3) {
      const item: Item = {
        id: `cat:${d.hash}`, hash: d.hash, name: d.name, slot, kind: "weapon", cls: "Any", exotic: true, owner: CATALOG_OWNER, equipped: false,
        power: light, damage: DAMAGE[d.damage] ?? "", locked: false, masterworked: false, gearTier: 0, energy: 0,
        stats: { health: 0, melee: 0, grenade: 0, super: 0, class: 0, weapons: 0 }, wstats: {},
        plugs: d.sockets.map(s => s.init), reusable: {}, options: {},
      };
      standIns.push({ item, source: e.source, acquired: e.acquired, assumedRoll: false });
    }
  }
  for (const x of standIns) SOURCES.set(x.item.id, { source: x.source, acquired: x.acquired });
  return { inv: { ...inv, items: [...inv.items, ...standIns.map(s => s.item)] }, standIns };
}

const total = (s: Record<string, number>) => Object.values(s).reduce((t, v) => t + v, 0);
