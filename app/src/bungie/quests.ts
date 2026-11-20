import { createStore, getMany, setMany } from "idb-keyval";
import { api } from "./api";

// Quests and story history, read live from Bungie.
// Quests: every quest item on each character, its quest line, which step it is, and live objective progress.
// Story history: the story missions each character has completed (Bungie's activity history, mode 2 = story).

export interface QuestObjective { text: string; progress: number; goal: number; done: boolean }
export interface Quest { hash: number; characterId: string; name: string; description: string; line: string; type: string; step: number; steps: number; objectives: QuestObjective[] }

interface QDef { name: string; description: string; line: string; type: string; step: number; steps: number; objectives: number[] }
interface ODef { text: string; goal: number }

const store = typeof indexedDB !== "undefined" ? createStore("steeped-quests", "defs") : null;
const QUEST_BUCKET = 1345459588;
const QDEF_VERSION = 1;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchMany<T>(keys: string[], fetchOne: (k: string) => Promise<T>): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (store && keys.length) {
    const cached = await getMany<{ v: number; d: T } | undefined>(keys, store).catch(() => []);
    cached.forEach((c, i) => { if (c && c.v === QDEF_VERSION) out.set(keys[i], c.d); });
  }
  const missing = keys.filter(k => !out.has(k));
  const fresh: [string, { v: number; d: T }][] = [];
  let i = 0;
  const worker = async () => {
    while (i < missing.length) {
      const k = missing[i++];
      try { const d = await fetchOne(k); out.set(k, d); fresh.push([k, { v: QDEF_VERSION, d }]); } catch { /* skip this one */ }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (store && fresh.length) await setMany(fresh, store).catch(() => undefined);
  return out;
}

export async function readQuests(P: any): Promise<Quest[]> {
  const IC = P.itemComponents ?? {}, inst = IC.objectives?.data ?? {}, uninst = P.characterUninstancedItemComponents ?? {};
  const items: [string, any][] = [];
  for (const [cid, inv] of Object.entries<any>(P.characterInventories?.data ?? {}))
    for (const it of inv.items ?? []) if (it.bucketHash === QUEST_BUCKET) items.push([cid, it]);
  const qdefs = await fetchMany<QDef>([...new Set(items.map(([, it]) => `i${it.itemHash}`))], async k => {
    const h = Number(k.slice(1));
    const d: any = await api(`/Destiny2/Manifest/DestinyInventoryItemDefinition/${h}/`);
    const list: any[] = d.setData?.itemList ?? [];
    return {
      name: d.displayProperties?.name ?? "", description: String(d.displayProperties?.description ?? "").replace(/\s+/g, " ").trim(),
      line: d.setData?.questLineName ?? "", type: d.itemTypeDisplayName ?? "",
      step: list.findIndex(x => x.itemHash === h), steps: list.length, objectives: d.objectives?.objectiveHashes ?? [],
    };
  });
  const objHashes = [...new Set([...qdefs.values()].flatMap(q => q.objectives))];
  const odefs = await fetchMany<ODef>(objHashes.map(h => `o${h}`), async k => {
    const d: any = await api(`/Destiny2/Manifest/DestinyObjectiveDefinition/${k.slice(1)}/`);
    return { text: d.progressDescription ?? "", goal: d.completionValue ?? 1 };
  });
  const out: Quest[] = [];
  for (const [cid, it] of items) {
    const q = qdefs.get(`i${it.itemHash}`);
    if (!q || (!q.name && !q.line)) continue;
    const live = it.itemInstanceId ? inst[it.itemInstanceId] : uninst[cid]?.objectives?.data?.[it.itemHash];
    const objectives = (live?.objectives ?? []).map((o: any) => {
      const od = odefs.get(`o${o.objectiveHash}`);
      return { text: od?.text ?? "", progress: o.progress ?? 0, goal: o.completionValue ?? od?.goal ?? 1, done: !!o.complete };
    });
    out.push({ hash: it.itemHash, characterId: cid, name: q.name, description: q.description, line: q.line, type: q.type, step: q.step, steps: q.steps, objectives });
  }
  return out;
}

// Story missions completed, by mission name (lower case), across all characters. Slow (a few pages per
// character), so it runs when you ask and is saved in this browser.
const STORY_KEY = "steeped-story-history";
export interface StoryHistory { at: number; missions: Record<string, number> }
export const loadStory = (): StoryHistory | null => { try { return JSON.parse(localStorage.getItem(STORY_KEY) ?? "null"); } catch { return null; } };

export const normMission = (n: string) => n.toLowerCase().replace(/\(.*?\)/g, "").split(":")[0].replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

export async function scanStory(account: { membershipType: number; membershipId: string }, characterIds: string[], progress: (m: string) => void): Promise<StoryHistory> {
  const acts: number[] = [];
  for (const [ci, cid] of characterIds.entries()) {
    for (let page = 0; page < 8; page++) {
      progress(`Reading story history: character ${ci + 1} of ${characterIds.length}, page ${page + 1}`);
      const r: any = await api(`/Destiny2/${account.membershipType}/Account/${account.membershipId}/Character/${cid}/Stats/Activities/?mode=2&count=250&page=${page}`);
      const list: any[] = r?.activities ?? [];
      for (const a of list) if (a.values?.completed?.basic?.value === 1) acts.push(a.activityDetails?.referenceId, a.activityDetails?.directorActivityHash);
      if (list.length < 250) break;
    }
  }
  progress("Matching missions");
  const names = await fetchMany<string>([...new Set(acts.filter(Boolean))].map(h => `a${h}`), async k => {
    const d: any = await api(`/Destiny2/Manifest/DestinyActivityDefinition/${k.slice(1)}/`);
    return d.displayProperties?.name ?? "";
  });
  const missions: Record<string, number> = {};
  for (const h of acts) { const n = names.get(`a${h}`); if (n) missions[normMission(n)] = (missions[normMission(n)] ?? 0) + 1; }
  const out = { at: Date.now(), missions };
  try { localStorage.setItem(STORY_KEY, JSON.stringify(out)); } catch { /* storage unavailable */ }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
