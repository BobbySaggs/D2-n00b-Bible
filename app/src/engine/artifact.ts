import type { ItemDef } from "../bungie/defs";
import type { Inventory, Item } from "../model/inventory";
import { perkKnowledge, type ArtifactPerk } from "../knowledge/artifact";
import { scoreLoops, type Goal, type Part } from "./loops";

// Monument of Triumph artifacts: every character holds all seven, each remembers its own perk picks, and each
// has 7 perk sockets. Two take column 1 perks, three take columns 1 and 2, two take any column. Bungie tells us
// which perks fit which socket, so Steeped reads that instead of hard-coding the grid.

export interface ArtSocket { index: number; options: ArtifactPerk[]; current?: ArtifactPerk }
export interface ArtifactChoice { item: Item; name: string; equipped: boolean; sockets: ArtSocket[] }

type DefOf = (h: number) => ItemDef | undefined;

const perkCache = new Map<number, ArtifactPerk>();
function perkOf(h: number, defOf: DefOf): ArtifactPerk | undefined {
  if (perkCache.has(h)) return perkCache.get(h);
  const d = defOf(h);
  if (!d?.name || /^Empty/i.test(d.name) || !d.plugCat.startsWith("artifact")) return undefined;
  const k = perkKnowledge(h, d.name, d.desc ?? "");
  perkCache.set(h, k);
  return k;
}

export function artifactsOf(inv: Inventory, defOf: DefOf, characterId: string): ArtifactChoice[] {
  return inv.items
    .filter(i => i.kind === "artifact" && i.owner === characterId)
    .map(item => {
      const sockets: ArtSocket[] = [];
      item.plugs.forEach((plugged, index) => {
        const hashes = new Set([...(item.options[index] ?? []), plugged]);
        const options = [...hashes].map(h => perkOf(h, defOf)).filter((x): x is ArtifactPerk => !!x);
        if (options.length > 1) sockets.push({ index, options, current: perkOf(plugged, defOf) });
      });
      return { item, name: item.name, equipped: item.equipped, sockets };
    })
    .filter(a => a.sockets.length);
}

export interface ArtifactFit { artifact: ArtifactChoice; perks: { socket: number; perk: ArtifactPerk }[]; score: number }

// Fill the sockets one at a time, most restrictive first, each with the perk that adds the most to this build.
// Ties keep the perk already there, so Steeped never asks you to change something for nothing.
export function fitArtifact(base: Part[], goal: Goal, a: ArtifactChoice, lock: string[] = []): ArtifactFit {
  const order = [...a.sockets].sort((x, y) => x.options.length - y.options.length);
  const chosen = new Map<number, ArtifactPerk>();
  const used = new Set<string>();
  // Locked perks first, each into the tightest socket that takes it.
  for (const name of lock) {
    const s = order.find(s => !chosen.has(s.index) && s.options.some(o => o.name === name));
    if (s) { const p = s.options.find(o => o.name === name)!; chosen.set(s.index, p); used.add(name); }
  }
  const parts = () => [...base, ...[...chosen.values()].map(k => ({ k }))];
  let score = scoreLoops(parts(), goal).score;
  for (const s of order) {
    if (chosen.has(s.index)) continue;
    let best: ArtifactPerk | undefined, bestScore = -Infinity, bestAdj = -Infinity;
    for (const o of s.options) {
      if (used.has(o.name)) continue;
      const sc = scoreLoops([...parts(), { k: o }], goal).score + (o.name === s.current?.name ? 0.01 : 0);
      // A perk Steeped only read from Bungie's text has to beat a checked one by a clear margin.
      const adj = sc - (o.read === "description" ? 1.5 : 0);
      if (adj > bestAdj) { bestAdj = adj; bestScore = sc; best = o; }
    }
    if (best) { chosen.set(s.index, best); used.add(best.name); score = bestScore; }
  }
  return { artifact: a, perks: [...chosen].map(([socket, perk]) => ({ socket, perk })).sort((x, y) => x.socket - y.socket), score };
}

export function bestArtifact(base: Part[], goal: Goal, arts: ArtifactChoice[], only?: string, lock: string[] = []): ArtifactFit | undefined {
  let best: ArtifactFit | undefined;
  for (const a of arts) {
    if (only && a.name !== only) continue;
    const f = fitArtifact(base, goal, a, lock);
    if (!best || f.score > best.score) best = f;
  }
  return best;
}

// Which socket each named perk goes in (for the in-game steps and Equip): tightest sockets first.
export function placePerks(a: ArtifactChoice, names: string[]): { socket: number; perk: ArtifactPerk }[] {
  const order = [...a.sockets].sort((x, y) => x.options.length - y.options.length);
  const out: { socket: number; perk: ArtifactPerk }[] = [];
  const left = [...names];
  // Keep perks that are already in a socket that allows them.
  for (const s of a.sockets) {
    const i = left.indexOf(s.current?.name ?? "");
    if (i >= 0) { out.push({ socket: s.index, perk: s.current! }); left.splice(i, 1); }
  }
  // Then perks that fit the fewest sockets go first.
  const fits = (n: string) => order.filter(s => s.options.some(o => o.name === n)).length;
  left.sort((x, y) => fits(x) - fits(y));
  for (const n of left) {
    const s = order.find(s => !out.some(o => o.socket === s.index) && s.options.some(o => o.name === n));
    if (s) out.push({ socket: s.index, perk: s.options.find(o => o.name === n)! });
  }
  return out.sort((x, y) => x.socket - y.socket);
}

export const perkByName = (arts: ArtifactChoice[]) => {
  const m = new Map<string, ArtifactPerk>();
  for (const a of arts) for (const s of a.sockets) for (const o of s.options) m.set(o.name, o);
  return m;
};
