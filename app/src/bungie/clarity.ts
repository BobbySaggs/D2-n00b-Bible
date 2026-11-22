import { createStore, get, set } from "idb-keyval";

// Clarity (d2clarity.com) publishes community-tested perk values. Steeped reads them to score perks on real numbers
// instead of its own reading of Bungie's text. Off until Clarity approves the partnership (see vite.config.ts).
export const CLARITY_ON: boolean = typeof __CLARITY__ !== "undefined" && __CLARITY__;
export const CLARITY_SITE = "https://www.d2clarity.com";
export const CLARITY_DISCORD = ""; // their invite link, once they confirm the credit terms
const BASE = "https://raw.githubusercontent.com/Database-Clarity/Live-Clarity-Database/live";

export interface ClarityPerk {
  hash: number;
  name: string;
  type: string;
  text: string; // their description, unchanged except for chat emoji tags
  dmgPct?: number; // the largest "% increased damage" it lists
  drPct?: number; // damage resistance
  energy: Partial<Record<"gEn" | "mEn" | "cEn" | "sEn", number>>; // % ability energy per trigger
}

const DATA = new Map<number, ClarityPerk>();
export const clarityFor = (hash: number) => DATA.get(hash);
export const clarityCount = () => DATA.size;
export function setClarity(perks: ClarityPerk[]) { DATA.clear(); for (const p of perks) DATA.set(p.hash, p); }

const clean = (t: string) => t.replace(/<:[a-z_]+:\d+>/gi, "").replace(/🡅/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
const nums = (s: string) => s.split("|").map(x => parseFloat(x)).filter(n => !isNaN(n));

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseClarity(raw: Record<string, any>): ClarityPerk[] {
  const out: ClarityPerk[] = [];
  for (const v of Object.values(raw)) {
    const en = v?.descriptions?.en;
    if (!v?.hash || typeof en !== "string") continue;
    const text = clean(en);
    const p: ClarityPerk = { hash: v.hash, name: v.name ?? "", type: v.type ?? "", text, energy: {} };
    for (const m of text.matchAll(/([\d.|%]+)%\s+(?:increased|more|bonus)\s+(?:[A-Za-z ]{0,30})?damage/gi)) {
      const n = Math.max(...nums(m[1].replace(/%/g, "")));
      if (isFinite(n) && n < 400) p.dmgPct = Math.max(p.dmgPct ?? 0, n);
    }
    for (const m of text.matchAll(/([\d.|%]+)%\s+damage resistance/gi)) {
      const n = Math.max(...nums(m[1].replace(/%/g, "")));
      if (isFinite(n) && n <= 100) p.drPct = Math.max(p.drPct ?? 0, n);
    }
    const kinds: [RegExp, keyof ClarityPerk["energy"]][] = [[/Grenade (?:Ability )?Energy/i, "gEn"], [/Melee (?:Ability )?Energy/i, "mEn"], [/Class Ability Energy/i, "cEn"], [/Super Energy/i, "sEn"]];
    for (const [re, k] of kinds) {
      const m = new RegExp(`([\\d.]+)%\\s+${re.source}`, "i").exec(text);
      if (m) p.energy[k] = parseFloat(m[1]);
    }
    out.push(p);
  }
  return out;
}

const store = typeof indexedDB !== "undefined" ? createStore("steeped-clarity", "v1") : null;

// Loads their live file once per Clarity version and keeps it on your device.
export async function loadClarity(): Promise<number> {
  if (!CLARITY_ON) return 0;
  if (DATA.size) return DATA.size;
  try {
    const ver = String(((await (await fetch(`${BASE}/versions.json`)).json()) as any)?.descriptions ?? "");
    const cached = store ? await get<{ ver: string; perks: ClarityPerk[] }>("perks", store).catch(() => undefined) : undefined;
    if (cached && cached.ver === ver && cached.perks.length) { setClarity(cached.perks); return DATA.size; }
    const perks = parseClarity(await (await fetch(`${BASE}/descriptions/crayon.json`)).json());
    setClarity(perks);
    if (store) await set("perks", { ver, perks }, store).catch(() => undefined);
  } catch { /* Clarity unreachable: Steeped falls back to its own readings */ }
  return DATA.size;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
