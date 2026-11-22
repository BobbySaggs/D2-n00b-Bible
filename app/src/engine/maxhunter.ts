import type { ItemDef } from "../bungie/defs";
import type { CatalogEntry } from "../bungie/catalog";
import type { Inventory } from "../model/inventory";
import type { Goal } from "./loops";
import { searchBuilds } from "./builds";
import { evaluate, makeCtx, specFromBuild, type BuildView, type Settings } from "./evaluate";
import { withCatalog, isStandIn, standInSource } from "./catalog";

// One number for "how maxed is this Hunter", and the ordered path to 100%.
// Pillars: Power (toward 550), Gear (the pieces in your best builds masterworked, at Tier 5, at your Power),
// and Builds (your best builds against the best Steeped can make with every exotic in the game).
export const POWER_CAP = 550;
const WEIGHT = { power: 0.4, gear: 0.3, builds: 0.3 };

export interface PathStep { what: string; why: string; gain: number; kind: "power" | "gear" | "farm" }
export interface MaxHunter {
  pct: number;
  pillars: { power: number; gear: number; builds: number };
  power: number;
  lowestSlot?: { slot: string; power: number };
  kit: { role: string; goal: Goal; view: BuildView }[];
  best: { role: string; view: BuildView }[];
  path: PathStep[];
}

type DefOf = (h: number) => ItemDef | undefined;

function bestBuild(inv: Inventory, defOf: DefOf, defs: ItemDef[], characterId: string, goal: Goal, settings: Settings): BuildView | undefined {
  const ctx = makeCtx(inv, defOf, defs, characterId);
  const found = searchBuilds({ inv, defOf, defs, characterId, goal, top: 5 }).map(specFromBuild);
  return found.map(sp => evaluate({ ...sp, goal }, ctx, settings))
    .sort((a, b) => a.issues.length - b.issues.length || b.score - a.score)[0];
}

export function maxHunter(inv: Inventory, defOf: DefOf, defs: ItemDef[], characterId: string, catalog: CatalogEntry[], progress?: (m: string) => void): MaxHunter {
  const settings: Settings = { targets: {}, mw: "asIs", style: "peaks", tune: true };
  const ch = inv.characters.find(c => c.id === characterId);
  const roles: [string, Goal][] = [["Max Hunter", "whole"], ["Boss damage", "bossDps"]];

  const kit: MaxHunter["kit"] = [];
  for (const [role, goal] of roles) {
    progress?.(`Finding your best ${role.toLowerCase()} build`);
    const v = bestBuild(inv, defOf, defs, characterId, goal, settings);
    if (v) kit.push({ role, goal, view: v });
  }
  const wc = withCatalog(inv, defOf, catalog, characterId);
  const best: MaxHunter["best"] = [];
  for (const [role, goal] of roles) {
    progress?.(`Finding the best possible ${role.toLowerCase()} build`);
    const v = bestBuild(wc.inv, defOf, defs, characterId, goal, settings);
    if (v) best.push({ role, view: v });
  }

  // Power: your best item in each slot counts, vault included.
  const slots = ["kinetic", "energy", "power", "helmet", "arms", "chest", "legs", "class"];
  const bySlot = slots.map(sl => ({ slot: sl, power: Math.max(0, ...inv.items.filter(i => i.slot === sl && (i.kind === "weapon" || i.cls === ch?.cls || i.cls === "Any")).map(i => i.power)) }));
  const power = bySlot.reduce((t, s) => t + s.power, 0) / slots.length;
  const lowest = [...bySlot].sort((a, b) => a.power - b.power)[0];
  const powerPct = Math.min(1, power / POWER_CAP);

  // Gear: every piece and gun in your kit.
  const path: PathStep[] = [];
  const checks: { ok: boolean; step?: Omit<PathStep, "gain"> }[] = [];
  const seen = new Set<string>();
  for (const { view } of kit) {
    for (const p of Object.values(view.armor?.pieces ?? {})) {
      if (seen.has(p.item.id)) continue;
      seen.add(p.item.id);
      const done = p.item.masterworked || p.mwLevel >= 5;
      checks.push({ ok: done, step: done ? undefined : { what: `Masterwork ${p.item.name}`, why: "Full stats on a piece your best build wears", kind: "gear" } });
    }
    for (const w of view.weapons) {
      if (!w || seen.has(w.item.id)) continue;
      seen.add(w.item.id);
      checks.push({ ok: !w.infuse, step: w.infuse ? { what: `Infuse ${w.item.name}`, why: `It's Power ${w.item.power}; your build uses it`, kind: "gear" } : undefined });
      if (!w.item.exotic && w.tier > 0) checks.push({ ok: w.tier >= 5, step: w.tier >= 5 ? undefined : { what: `Upgrade ${w.item.name} to Tier 5`, why: `It's Tier ${w.tier}. Weapon Tier Upgrading unlocks its enhanced perks`, kind: "gear" } });
    }
  }
  const gearPct = checks.length ? checks.filter(c => c.ok).length / checks.length : 1;
  const perCheck = checks.length ? (WEIGHT.gear * 100) / checks.length : 0;
  for (const c of checks) if (c.step) path.push({ ...c.step, gain: perCheck });

  // Builds: your best against the best possible, per role.
  const ratios = kit.map(k => {
    const b = best.find(x => x.role === k.role)?.view;
    return b && b.score > 0 ? Math.min(1, k.view.score / b.score) : 1;
  });
  const buildsPct = ratios.length ? ratios.reduce((t, r) => t + r, 0) / ratios.length : 1;
  best.forEach(({ role, view }) => {
    const mine = kit.find(k => k.role === role)?.view;
    if (!mine || view.score <= mine.score) return;
    const missing = [...view.weapons.filter(Boolean).map(w => w!.item), ...Object.values(view.armor?.pieces ?? {}).map(p => p.item)].filter(isStandIn);
    const gain = ((view.score - mine.score) / view.score) * (WEIGHT.builds * 100) / Math.max(1, best.length);
    for (const it of missing) {
      const src = standInSource(it.id);
      path.push({ what: src?.acquired ? `Pull ${it.name} from Collections` : `Get ${it.name}`, why: `Raises your ${role.toLowerCase()} build${src?.source && !src.acquired ? `. Source: ${src.source}` : ""}`, gain: gain / missing.length, kind: "farm" });
    }
  });

  if (power < POWER_CAP) path.push({ what: "Run Solo Ops at Grade A or better", why: `Power ${power.toFixed(1)} of ${POWER_CAP}. Your lowest slot is ${lowest.slot} (${lowest.power}): equip any higher drop there`, gain: WEIGHT.power * 100 * (1 - powerPct), kind: "power" });
  path.sort((a, b) => b.gain - a.gain);

  const pct = 100 * (WEIGHT.power * powerPct + WEIGHT.gear * gearPct + WEIGHT.builds * buildsPct);
  return { pct, pillars: { power: powerPct * 100, gear: gearPct * 100, builds: buildsPct * 100 }, power, lowestSlot: lowest, kit, best, path };
}
