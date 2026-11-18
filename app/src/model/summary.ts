import type { ClassName } from "../bungie/config";
import type { Character, Inventory, Item } from "./inventory";

export interface ClassSummary {
  cls: ClassName;
  character?: Character;
  subclass?: string;
  wornExotic?: string;
  wornWeapons: string[];
  armor: number;
  tier5: number;
  exotics: string[]; // unique exotic armor names you own for this class
}

export interface Summary {
  classes: ClassSummary[];
  weapons: number;
  exoticWeapons: string[];
  vault: number;
  itemsOnCharacters: number;
}

const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y));

export function summarize(inv: Inventory): Summary {
  const byCls = (c: ClassName) => inv.items.filter(i => i.kind === "armor" && i.cls === c);
  const worn = (c: Character | undefined, f: (i: Item) => boolean) =>
    c ? inv.items.filter(i => i.owner === c.id && i.equipped && f(i)) : [];
  const classes: ClassSummary[] = (["Hunter", "Titan", "Warlock"] as ClassName[]).map(cls => {
    const character = inv.characters.find(c => c.cls === cls);
    const armor = byCls(cls);
    return {
      cls, character,
      subclass: worn(character, i => i.kind === "subclass")[0]?.name,
      wornExotic: worn(character, i => i.kind === "armor" && i.exotic)[0]?.name,
      wornWeapons: worn(character, i => i.kind === "weapon").map(i => i.name),
      armor: armor.length,
      tier5: armor.filter(i => i.gearTier >= 5).length,
      exotics: uniq(armor.filter(i => i.exotic).map(i => i.name)),
    };
  }).filter(s => s.character || s.armor);
  // Most recently played character first.
  classes.sort((a, b) => (b.character?.lastPlayed ?? "").localeCompare(a.character?.lastPlayed ?? ""));
  const weapons = inv.items.filter(i => i.kind === "weapon");
  return {
    classes,
    weapons: weapons.length,
    exoticWeapons: uniq(weapons.filter(i => i.exotic).map(i => i.name)),
    vault: inv.vaultCount,
    itemsOnCharacters: inv.items.filter(i => i.owner !== "vault" && i.kind !== "subclass").length,
  };
}
