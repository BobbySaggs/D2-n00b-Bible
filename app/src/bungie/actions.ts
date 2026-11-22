import { api, BungieError } from "./api";

// Bungie item actions. Each throws a BungieError with a plain-words message the equip screen can show.
const PLAIN: Record<string, string> = {
  DestinyCannotPerformActionAtThisLocation: "Bungie won't change gear here. Go to orbit or a social space (the Tower, the Pale Heart) and try again.",
  DestinyNoRoomInDestination: "No room on your character for this item. Move something in that slot to the vault and try again.",
  DestinyItemNotFound: "Bungie can't find this item anymore. Tap Refresh, then try again.",
  DestinyItemUniqueEquipRestricted: "Only one exotic weapon and one exotic armor piece can be equipped at a time.",
  DestinySocketActionNotAllowed: "Bungie doesn't allow changing this socket from an app. Do this one in game.",
  DestinyPlugInsertFailed: "Bungie refused this mod or plug (often armor energy). Do this one in game.",
  DestinyCharacterNotInTower: "Go to orbit or a social space and try again.",
};

export function plain(e: unknown): string {
  if (e instanceof BungieError && PLAIN[e.status]) return PLAIN[e.status];
  return e instanceof Error ? e.message : String(e);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Bungie throttles item actions; wait and retry a couple of times before giving up.
async function act<T>(path: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<T>(path, body);
    } catch (e) {
      const throttled = e instanceof BungieError && /Throttl/i.test(e.status);
      if (!throttled || attempt >= 3) throw e;
      await sleep(1200 * (attempt + 1));
    }
  }
}

export interface Who { membershipType: number; characterId: string }

export const transfer = (w: Who, itemHash: number, itemId: string, toVault: boolean, characterId: string) =>
  act("/Destiny2/Actions/Items/TransferItem/", { itemReferenceHash: itemHash, stackSize: 1, transferToVault: toVault, itemId, characterId, membershipType: w.membershipType });

export const equipItems = (w: Who, itemIds: string[]) =>
  act<{ equipResults?: { itemInstanceId: string; equipStatus: number }[] }>("/Destiny2/Actions/Items/EquipItems/", { itemIds, characterId: w.characterId, membershipType: w.membershipType });

export const insertPlug = (w: Who, itemId: string, socketIndex: number, plugItemHash: number) =>
  act("/Destiny2/Actions/Items/InsertSocketPlugFree/", { plug: { socketIndex, socketArrayType: 0, plugItemHash }, itemId, characterId: w.characterId, membershipType: w.membershipType });

// Saves what the character is wearing right now into one of its in-game loadout slots (overwrites that slot).
export const snapshotLoadout = (w: Who, loadoutIndex: number, slot: { nameHash: number; colorHash: number; iconHash: number }) =>
  act("/Destiny2/Actions/Loadouts/SnapshotLoadout/", { loadoutIndex, colorHash: slot.colorHash, iconHash: slot.iconHash, nameHash: slot.nameHash, characterId: w.characterId, membershipType: w.membershipType });

export { sleep };
