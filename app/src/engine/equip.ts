import { ARMOR_SLOTS, STAT_LABEL } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import type { Item } from "../model/inventory";
import { fullModPlan, type BuildView, type Ctx } from "./evaluate";
import { placePerks } from "./artifact";

// The full list of what "Equip in game" will do, in the order Bungie needs it. Steps that the app can't do
// (a plug Steeped can't identify) come back as "manual" so they're never silently skipped.
export type EquipStep =
  | { kind: "move"; label: string; item: Item; via: "vault" | "direct" }
  | { kind: "equip"; label: string; items: Item[] }
  | { kind: "plug"; label: string; item: Item; socket: number; hash: number; group: Group }
  | { kind: "manual"; label: string; why: string; group: Group };
type Group = "subclass" | "mods" | "artifact" | "weapons";

const SUB_KIND = (cat: string) =>
  /supers/.test(cat) ? "super" : /grenades/.test(cat) ? "grenade" : /melee/.test(cat) ? "melee" : /class_abilities/.test(cat) ? "classAbility"
    : /movement/.test(cat) ? "jump" : /aspects|totems/.test(cat) ? "aspect" : /fragments|trinkets/.test(cat) ? "fragment" : "";

// Every plug a socket can take: what Bungie lists for the item, plus the account-wide pool for that plug set.
function socketPlugs(item: Item, i: number, ctx: Ctx): ItemDef[] {
  const sd = ctx.defOf(item.hash)?.sockets[i];
  const hashes = new Set<number>([...(item.options[i] ?? []), ...(sd ? ctx.ownedMods.get(sd.reusable) ?? [] : []), item.plugs[i]].filter(Boolean));
  return [...hashes].map(h => ctx.defOf(h)).filter((d): d is ItemDef => !!d);
}

export function equipPlan(v: BuildView, ctx: Ctx): EquipStep[] {
  const steps: EquipStep[] = [];
  const cid = ctx.characterId;
  const items: Item[] = [];
  const sub = ctx.inv.items.find(i => i.kind === "subclass" && i.owner === cid && i.name === v.spec.subclass);
  const weapons = v.weapons.filter((w): w is NonNullable<typeof w> => !!w).map(w => w.item);
  const armor = ARMOR_SLOTS.map(s => v.armor?.pieces[s]?.item).filter((x): x is Item => !!x);
  items.push(...weapons, ...armor);

  // 1) Bring everything to this character.
  for (const it of items) if (it.owner !== cid) steps.push({ kind: "move", label: `Move ${it.name} from ${it.owner === "vault" ? "your vault" : "another character"}`, item: it, via: it.owner === "vault" ? "direct" : "vault" });
  // 2) Equip: subclass and legendaries first, exotics last (Bungie allows one exotic weapon and one exotic armor).
  const art = v.artifact && v.spec.artifact ? v.artifact : undefined;
  const need = [...(sub && !sub.equipped ? [sub] : []), ...(art && !art.equipped ? [art.item] : []), ...items.filter(i => !(i.owner === cid && i.equipped))];
  const legendary = need.filter(i => !i.exotic), exotic = need.filter(i => i.exotic);
  if (legendary.length) steps.push({ kind: "equip", label: `Equip ${legendary.map(i => i.name).join(", ")}`, items: legendary });
  if (exotic.length) steps.push({ kind: "equip", label: `Equip ${exotic.map(i => i.name).join(", ")}`, items: exotic });

  // 3) Subclass: clear fragments, set aspects, set fragments, then abilities.
  if (!sub) steps.push({ kind: "manual", group: "subclass", label: `Switch to ${v.spec.subclass}`, why: "Steeped can't find this subclass on your character." });
  else {
    const def = ctx.defOf(sub.hash);
    const kinds = (def?.sockets ?? []).map((_, i) => {
      const cur = ctx.defOf(sub.plugs[i]);
      return SUB_KIND(cur?.plugCat ?? socketPlugs(sub, i, ctx)[0]?.plugCat ?? "");
    });
    const idx = (k: string) => kinds.map((x, i) => (x === k ? i : -1)).filter(i => i >= 0);
    const find = (i: number, name: string) => socketPlugs(sub, i, ctx).find(d => d.name === name);
    const curName = (i: number) => ctx.defOf(sub.plugs[i])?.name ?? "";
    const plug = (i: number, name: string, label: string) => {
      if (curName(i) === name) return;
      const d = find(i, name);
      if (d) steps.push({ kind: "plug", group: "subclass", label, item: sub, socket: i, hash: d.hash });
      else steps.push({ kind: "manual", group: "subclass", label, why: "Steeped can't match this to Bungie's data. Set it in game." });
    };
    const fragSockets = idx("fragment"), aspSockets = idx("aspect");
    const wantFr = v.spec.fragments, wantAs = v.spec.aspects;
    const aspChange = aspSockets.map(curName).sort().join() !== [...wantAs].sort().join();
    // Fragments that stay keep their socket (unless a smaller aspect would switch that socket off).
    const cap = Math.min(fragSockets.length, wantFr.length);
    const keep = new Set(fragSockets.filter((i, n) => n < cap && wantFr.includes(curName(i))));
    const clearList = fragSockets.filter(i => !keep.has(i) && curName(i) && !/Empty/.test(curName(i)));
    for (const i of clearList) {
      const empty = socketPlugs(sub, i, ctx).find(d => /Empty Fragment/.test(d.name));
      if (empty) steps.push({ kind: "plug", group: "subclass", label: `Remove fragment ${curName(i)}`, item: sub, socket: i, hash: empty.hash });
    }
    if (aspChange) wantAs.forEach((a, n) => { if (aspSockets[n] !== undefined) plug(aspSockets[n], a, `Aspect: ${a}`); });
    const placed = new Set([...keep].map(curName));
    const freeFr = fragSockets.slice(0, Math.max(cap, wantFr.length)).filter(i => !keep.has(i));
    wantFr.filter(f => !placed.has(f)).forEach((f, n) => {
      const i = freeFr[n];
      if (i === undefined) return;
      const d = find(i, f);
      if (d) steps.push({ kind: "plug", group: "subclass", label: `Fragment: ${f}`, item: sub, socket: i, hash: d.hash });
      else steps.push({ kind: "manual", group: "subclass", label: `Fragment: ${f}`, why: "Steeped can't match this to Bungie's data. Set it in game." });
    });
    for (const [k, name, label] of [["super", v.spec.super, "Super"], ["grenade", v.spec.grenade, "Grenade"], ["melee", v.spec.melee, "Melee"], ["classAbility", v.spec.classAbility, "Class ability"]] as const) {
      const i = idx(k)[0];
      if (i === undefined) { if (name) steps.push({ kind: "manual", group: "subclass", label: `${label}: ${name}`, why: "Set it in game." }); continue; }
      plug(i, name, `${label}: ${name}`);
    }
  }

  // 3b) Weapon perks: switch to the perk Steeped picked in each column (free in game, and from here).
  for (const w of v.weapons) {
    if (!w) continue;
    w.cols.forEach((c, j) => {
      const pick = w.ks[w.base.length + j] as { name: string; hash?: number } | undefined;
      if (!pick?.hash || w.item.plugs[c.socket] === pick.hash) return;
      steps.push({ kind: "plug", group: "weapons", label: `${w.item.name}: ${pick.name}`, item: w.item, socket: c.socket, hash: pick.hash });
    });
  }

  // 4) Artifact perks: each perk into a socket that takes it, keeping perks that stay where they are.
  if (art) {
    for (const { socket, perk } of placePerks(art, v.spec.artifactPerks ?? [])) {
      if (art.item.plugs[socket] === perk.hash) continue;
      steps.push({ kind: "plug", group: "artifact", label: `Artifact perk: ${perk.name}`, item: art.item, socket, hash: perk.hash });
    }
    const placed = placePerks(art, v.spec.artifactPerks ?? []).map(p => p.perk.name);
    for (const n of v.spec.artifactPerks ?? []) if (!placed.includes(n)) steps.push({ kind: "manual", group: "artifact", label: `Artifact perk: ${n}`, why: "No open socket takes it. Set it in game." });
  }

  // 5) Armor mods: clear what changes, then the +10 stat mod, then the other slots.
  for (const pm of fullModPlan(v, ctx)) {
    const it = pm.piece.item;
    const def = ctx.defOf(it.hash);
    const cat = (i: number) => socketPlugs(it, i, ctx).find(d => d.plugCat.startsWith("enhancements."))?.plugCat ?? "";
    const sockets = (def?.sockets ?? []).map((_, i) => i);
    const general = sockets.find(i => cat(i) === "enhancements.v2_general");
    const slotCat = `enhancements.v2_${pm.slot === "class" ? "class_item" : pm.slot === "helmet" ? "head" : pm.slot}`;
    const slotSockets = sockets.filter(i => cat(i) === slotCat);
    const name = (i: number) => ctx.defOf(it.plugs[i])?.name ?? "";
    const want = pm.mods.map(m => m.name);
    // Keep mods that stay; put new ones in the sockets they free up.
    const keep = new Set(slotSockets.filter(i => want.includes(name(i))));
    const free = slotSockets.filter(i => !keep.has(i));
    const toAdd = pm.mods.filter(m => !slotSockets.some(i => keep.has(i) && name(i) === m.name));
    for (const i of free) if (!/Empty/.test(name(i)) && name(i)) {
      const empty = socketPlugs(it, i, ctx).find(d => d.name === "Empty Mod Socket");
      if (empty) steps.push({ kind: "plug", group: "mods", label: `${it.name}: remove ${name(i)}`, item: it, socket: i, hash: empty.hash });
    }
    const tune = v.armor?.tuning?.[pm.slot];
    if (tune && pm.piece.tuneSocket >= 0) steps.push({ kind: "plug", group: "mods", label: `${it.name}: tuning ${tune.name}`, item: it, socket: pm.piece.tuneSocket, hash: tune.hash });
    if (pm.statMod && general !== undefined) {
      const statName = `${STAT_LABEL[pm.statMod.stat] === "Weapons" ? "Weapons" : STAT_LABEL[pm.statMod.stat]} Mod`;
      if (name(general) !== statName) {
        const d = socketPlugs(it, general, ctx).find(x => x.name === statName);
        if (d) steps.push({ kind: "plug", group: "mods", label: `${it.name}: +10 ${STAT_LABEL[pm.statMod.stat]} mod`, item: it, socket: general, hash: d.hash });
        else steps.push({ kind: "manual", group: "mods", label: `${it.name}: +10 ${STAT_LABEL[pm.statMod.stat]} mod`, why: "Not found in your unlocked mods. Slot it in game." });
      }
    }
    toAdd.forEach((m, n) => {
      const i = free[n];
      if (i === undefined) { steps.push({ kind: "manual", group: "mods", label: `${it.name}: ${m.name}`, why: "No free socket. Slot it in game." }); return; }
      steps.push({ kind: "plug", group: "mods", label: `${it.name}: ${m.name}`, item: it, socket: i, hash: m.hash });
    });
  }
  return steps;
}

// ---------- Undo: what you wore before Equip, and the plan to put it back ----------
export interface WornSnapshot { at: number; characterId: string; items: { id: string; name: string; exotic: boolean; plugs: number[] }[] }
const UNDO_KEY = "steeped-undo";

export function snapshotWorn(ctx: Ctx): WornSnapshot {
  const items = ctx.inv.items.filter(i => i.owner === ctx.characterId && i.equipped && ["subclass", "armor", "weapon", "artifact"].includes(i.kind));
  return { at: Date.now(), characterId: ctx.characterId, items: items.map(i => ({ id: i.id, name: i.name, exotic: i.exotic, plugs: [...i.plugs] })) };
}
export const saveUndo = (s: WornSnapshot) => { try { localStorage.setItem(UNDO_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } };
export const loadUndo = (): WornSnapshot | null => { try { return JSON.parse(localStorage.getItem(UNDO_KEY) ?? "null") as WornSnapshot | null; } catch { return null; } };
export const clearUndo = () => { try { localStorage.removeItem(UNDO_KEY); } catch { /* storage unavailable */ } };

// Bring the saved items back, equip them, then set every socket back: first empty the sockets that changed
// (frees fragment slots and armor energy), then put the old plugs in, in socket order.
export function restorePlan(snap: WornSnapshot, ctx: Ctx): EquipStep[] {
  const steps: EquipStep[] = [];
  const cid = ctx.characterId;
  const now = snap.items.map(s => ({ s, it: ctx.inv.items.find(i => i.id === s.id) }));
  for (const { s, it } of now) if (!it) steps.push({ kind: "manual", group: "mods", label: `Find ${s.name}`, why: "It's no longer in your inventory or vault." });
  const found = now.filter((x): x is { s: WornSnapshot["items"][number]; it: Item } => !!x.it);
  for (const { it } of found) if (it.owner !== cid) steps.push({ kind: "move", label: `Move ${it.name} from ${it.owner === "vault" ? "your vault" : "another character"}`, item: it, via: it.owner === "vault" ? "direct" : "vault" });
  const need = found.filter(x => !(x.it.owner === cid && x.it.equipped)).map(x => x.it);
  const leg = need.filter(i => !i.exotic), exo = need.filter(i => i.exotic);
  if (leg.length) steps.push({ kind: "equip", label: `Equip ${leg.map(i => i.name).join(", ")}`, items: leg });
  if (exo.length) steps.push({ kind: "equip", label: `Equip ${exo.map(i => i.name).join(", ")}`, items: exo });
  for (const { s, it } of found) {
    if (it.kind === "weapon") continue;
    const group: "subclass" | "mods" | "artifact" = it.kind === "subclass" ? "subclass" : it.kind === "artifact" ? "artifact" : "mods";
    const changed = s.plugs.map((_, i) => i).filter(i => s.plugs[i] && it.plugs[i] !== s.plugs[i]);
    for (const i of changed) {
      const empty = socketPlugs(it, i, ctx).find(d => /^Empty/.test(d.name));
      if (empty && it.plugs[i] !== empty.hash && !/^Empty/.test(ctx.defOf(it.plugs[i])?.name ?? "")) steps.push({ kind: "plug", group, label: `${it.name}: clear ${ctx.defOf(it.plugs[i])?.name ?? "socket"}`, item: it, socket: i, hash: empty.hash });
    }
    for (const i of changed) {
      const d = ctx.defOf(s.plugs[i]);
      if (d && /^Empty/.test(d.name) && steps.some(x => x.kind === "plug" && x.item.id === it.id && x.socket === i)) continue; // already cleared
      steps.push({ kind: "plug", group, label: `${it.name}: ${d?.name ?? "previous plug"}`, item: it, socket: i, hash: s.plugs[i] });
    }
  }
  return steps;
}
