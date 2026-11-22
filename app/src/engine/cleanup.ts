import type { ItemDef } from "../bungie/defs";
import { STAT_ORDER } from "../bungie/config";
import type { Inventory, Item } from "../model/inventory";
import { ownedWeapons, type Weapon } from "./builds";
import { readPiece, type Piece } from "./armor";

// Vault cleanup: items that are safe to dismantle because you own something that does the same job at least as well.
// Steeped only flags clear cases: duplicate weapon rolls, and armor beaten on every stat by a piece from the same set.
// Locked items, exotics you have one copy of, and anything in your best builds are never flagged.
export interface Junk { item: Item; reason: string; keep: Item }

const setName = (n: string) => n.split(" ").slice(0, -1).join(" ") || n; // "Iron Battalion Vest" -> "Iron Battalion"

export function cleanup(inv: Inventory, defOf: (h: number) => ItemDef | undefined, keepIds: Set<string> = new Set()): Junk[] {
  const out: Junk[] = [];
  const safe = (i: Item) => !i.locked && !i.equipped && !keepIds.has(i.id);

  // Weapons: the same gun with the same perk options. Keep the best copy (tier, then Power).
  const groups = new Map<string, Weapon[]>();
  for (const w of ownedWeapons(inv, defOf)) {
    const sig = [w.item.name, ...w.cols.map(c => c.options.map(o => o.name).sort().join("/"))].join("|");
    groups.set(sig, [...(groups.get(sig) ?? []), w]);
  }
  for (const ws of groups.values()) {
    if (ws.length < 2) continue;
    ws.sort((a, b) => b.tier - a.tier || b.item.power - a.item.power || Number(b.item.masterworked) - Number(a.item.masterworked));
    const keep = ws[0].item;
    for (const w of ws.slice(1)) if (safe(w.item)) out.push({ item: w.item, keep, reason: `Same roll as the ${keep.name} you're keeping (${ws[0].tier ? `Tier ${ws[0].tier}, ` : ""}Power ${keep.power})` });
  }

  // Armor: a piece beaten on every stat by another piece of the same set, slot, class and archetype.
  const pieces = inv.items.filter(i => i.kind === "armor" && !i.exotic).map(i => readPiece(i, defOf)).filter((p): p is Piece => !!p);
  const bucket = new Map<string, Piece[]>();
  for (const p of pieces) {
    const key = [p.item.cls, p.item.slot, setName(p.item.name), p.archetype].join("|");
    bucket.set(key, [...(bucket.get(key) ?? []), p]);
  }
  for (const ps of bucket.values()) {
    for (const p of ps) {
      if (!safe(p.item)) continue;
      const better = ps.find(q => q !== p && q.tier >= p.tier && STAT_ORDER.every(k => q.base[k] >= p.base[k]) && STAT_ORDER.some(k => q.base[k] > p.base[k] || q.tier > p.tier));
      if (better) out.push({ item: p.item, keep: better.item, reason: `Another ${better.item.name} beats it on every stat${better.tier > p.tier ? ` and is Tier ${better.tier}` : ""}` });
    }
  }
  return out;
}
