import { useSyncExternalStore } from "react";
import type { ClassName } from "../bungie/config";
import type { Character, Inventory } from "../model/inventory";

// Which character Steeped is working on. Every screen reads the same choice, kept per browser by class.
// Without a choice it's the character you played last.
export const SUPPORTED: ClassName[] = ["Hunter", "Warlock"];
const KEY = "steeped-character-cls";
let cur: ClassName | null = (() => { try { return localStorage.getItem(KEY) as ClassName | null; } catch { return null; } })();
const subs = new Set<() => void>();

export function setCharacterClass(c: ClassName) {
  cur = c;
  try { localStorage.setItem(KEY, c); } catch { /* private mode: keep it for this visit */ }
  subs.forEach(f => f());
}

export const supportedCharacters = (inv: Inventory) => inv.characters.filter(c => SUPPORTED.includes(c.cls));

export function pickCharacter(inv: Inventory, cls: ClassName | null): Character | undefined {
  const list = supportedCharacters(inv);
  const last = [...list].sort((a, b) => (b.lastPlayed ?? "").localeCompare(a.lastPlayed ?? ""))[0];
  return list.find(c => c.cls === cls) ?? last;
}

export const useCharacterClass = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => cur, () => cur);
export function useCharacter(inv: Inventory): Character | undefined {
  return pickCharacter(inv, useCharacterClass());
}
