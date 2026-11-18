import { ARMOR_SLOTS, STAT_LABEL } from "../bungie/config";
import type { ItemDef } from "../bungie/defs";
import type { Item } from "../model/inventory";
import { fullModPlan, type BuildView, type Ctx } from "./evaluate";

// The full list of what "Equip in game" will do, in the order Bungie needs it. Steps that the app can't do
// (a plug Steeped can't identify) come back as "manual" so they're never silently skipped.
export type EquipStep =
  | { kind: "move"; label: string; item: Item; via: "vault" | "direct" }
  | { kind: "equip"; label: string; items: Item[] }
  | { kind: "plug"; label: string; item: Item; socket: number; hash: number; group: "subclass" | "mods" }
  | { kind: "manual"; label: string; why: string; group: "subclass" | "mods" };

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
  const need = [...(sub && !sub.equipped ? [sub] : []), ...items.filter(i => !(i.owner === cid && i.equipped))];
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

  // 4) Armor mods: clear what changes, then the +10 stat mod, then the other slots.
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
