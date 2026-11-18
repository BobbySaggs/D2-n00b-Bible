import { api, BungieError } from "./api";
import { COMPONENTS } from "./config";
import { DEFS, def, loadDefs, type ItemDef } from "./defs";
import { buildInventory, itemHashes, plugHashes, plugSetHashes, type Inventory } from "../model/inventory";

export interface LoadResult {
  inventory: Inventory;
  // Kept so the snapshot export can hand Claude the exact same inputs the app used.
  raw: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function loadEverything(progress: (msg: string) => void): Promise<LoadResult> {
  progress("Finding your Destiny account");
  const m: any = await api("/User/GetMembershipsForCurrentUser/");
  const mems: any[] = m.destinyMemberships ?? [];
  const mem = mems.find(x => x.membershipId === m.primaryMembershipId)
    ?? mems.find(x => x.crossSaveOverride === x.membershipType) ?? mems[0];
  if (!mem) throw new BungieError("No Destiny 2 account is linked to this Bungie login.");
  const account = {
    name: m.bungieNetUser?.uniqueName || m.bungieNetUser?.displayName || mem.displayName || "Guardian",
    membershipType: mem.membershipType,
    membershipId: String(mem.membershipId),
  };

  progress("Downloading your characters and vault");
  const P: any = await api(`/Destiny2/${mem.membershipType}/Profile/${mem.membershipId}/?components=${COMPONENTS}`);

  await loadDefs(itemHashes(P), (d, t) => progress(`Reading your gear (${d} of ${t} new items)`));
  await loadDefs([...plugHashes(P), ...plugSetHashes(P, def)], (d, t) => progress(`Reading perks, mods and subclass options (${d} of ${t} new)`));

  progress("Putting it together");
  const inventory = buildInventory(P, def, account);
  return { inventory, raw: P };
}

// Everything Claude needs to test the engine on your real gear. No sign-in token is included.
export function makeSnapshot(r: LoadResult) {
  const used = new Set<number>([...itemHashes(r.raw), ...plugHashes(r.raw), ...plugSetHashes(r.raw, def)]);
  const defs: Record<number, ItemDef> = {};
  for (const h of used) { const d = DEFS.get(h); if (d) defs[h] = d; }
  return {
    kind: "steeped-snapshot",
    version: 1,
    takenAt: new Date().toISOString(),
    account: r.inventory.account,
    profile: r.raw,
    defs,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
