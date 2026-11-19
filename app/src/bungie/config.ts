// Bungie app settings. The API key and client id are public by design (Public OAuth client).
// The client secret, if Steeped ever moves to a Confidential client, lives only in the Cloudflare Worker.
export const BNET = "https://www.bungie.net";
export const BUNGIE = {
  apiKey: "a4ab8a4c4ed14977892674f77eebecc5",
  clientId: "56677",
};

// Bungie only sends sign-ins back to the main site's address. The beta reads the same saved
// sign-in (same site, same browser storage), and the main site forwards beta sign-ins here.
export const MAIN_SITE_PATH = "/D2-n00b-Bible/";
export const BETA_STATE_PREFIX = "beta-";

export const STAT_HASH = {
  health: 392767087,
  melee: 4244567218,
  grenade: 1735777505,
  super: 144602215,
  class: 1943323491,
  weapons: 2996146975,
} as const;
export type StatKey = keyof typeof STAT_HASH;
// The character screen's order.
export const STAT_ORDER: StatKey[] = ["health", "melee", "grenade", "super", "class", "weapons"];
export const STAT_LABEL: Record<StatKey, string> = {
  health: "Health", melee: "Melee", grenade: "Grenade", super: "Super", class: "Class", weapons: "Weapons",
};

export const BUCKET: Record<number, Slot> = {
  3448274439: "helmet", 3551918588: "arms", 14239492: "chest", 20886954: "legs", 1585787867: "class",
  1498876634: "kinetic", 2465295065: "energy", 953998645: "power",
  3284755031: "subclass",
};
export type Slot = "helmet" | "arms" | "chest" | "legs" | "class" | "kinetic" | "energy" | "power" | "subclass";
export const ARMOR_SLOTS: Slot[] = ["helmet", "arms", "chest", "legs", "class"];
export const WEAPON_SLOTS: Slot[] = ["kinetic", "energy", "power"];
export const VAULT_BUCKET = 138197802;
export const ARTIFACT_BUCKET = 1506418338;

export const DAMAGE: Record<number, string> = {
  3373582085: "Kinetic", 2303181850: "Arc", 1847026933: "Solar", 3454344768: "Void", 151347233: "Stasis", 3949783978: "Strand",
};
export const CLASS_NAME: Record<number, ClassName> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };
export type ClassName = "Titan" | "Hunter" | "Warlock";

// Profile components (bungie.net DestinyComponentType).
export const COMPONENTS = [
  100, // profiles
  102, // vault
  103, // currencies
  104, // profile progression (artifact)
  200, // characters
  201, // character inventories
  202, // character progressions
  205, // character equipment
  300, // item instances
  301, // item objectives
  304, // item stats
  305, // item sockets
  308, // item plug states
  310, // item reusable plugs
  800, // collectibles
].join(",");
