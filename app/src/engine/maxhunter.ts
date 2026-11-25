import { BUILDS } from "../knowledge/research";
import type { ItemDef } from "../bungie/defs";
import type { CatalogEntry } from "../bungie/catalog";
import type { Inventory, Item } from "../model/inventory";
import { STAT_LABEL, STAT_ORDER, type StatKey } from "../bungie/config";
import type { Goal } from "./loops";
import { searchBuilds } from "./builds";
import { evaluate, evaluateNow, makeCtx, specFromBuild, tuneArtifactNow, type ArtifactTune, type BuildView, type Settings } from "./evaluate";
import { withCatalog, isStandIn, standInSource } from "./catalog";

// One number for "how maxed is this Hunter", and the ordered path to 100%.
// Pillars: Power (toward 550), Gear (the pieces in your best builds masterworked, at Tier 5, at your Power),
// and Builds (your best builds against the best Steeped can make with every exotic in the game).
export const POWER_CAP = 550;
const WEIGHT = { power: 0.4, gear: 0.3, builds: 0.3 };

// What to farm, said the way you'd ask for it: a legendary comes with the roll that makes it worth chasing.
export function farmName(it: Item, view: BuildView): string {
  if (it.kind !== "weapon" || it.exotic) return it.name;
  const perks = (view.spec.weaponPerks?.[it.id] ?? []).filter(Boolean);
  return `${it.name} (Tier 5${perks.length ? `, ${perks.join(" + ")}` : ""})`;
}

export interface PathStep { what: string; why: string; gain: number; kind: "power" | "gear" | "farm" }
export type Confidence = "Proven" | "Mostly proven" | "Best guess";
export interface Report {
  role: string;
  stars: { clear: number; boss: number; survive: number }; // 1-5, against the best Steeped found for you
  verdict: string;
  why: { name: string; play: string }[];
  shines: string;
  struggles: string;
  confidence: Confidence;
  confidenceWhy: string;
  cost: string[]; // what it takes to run it at full strength
  view: BuildView;
}
export type Grade = "Great" | "Good" | "Needs work";
// Grades for what you wear, against the best Steeped found for that job: 90%+ Great, 75%+ Good.
export const gradeOf = (ratio: number): Grade => (ratio >= 0.9 ? "Great" : ratio >= 0.75 ? "Good" : "Needs work");
export interface Possible { role: string; view: BuildView; steps: { what: string; why: string; kind: "get" | "gear" | "power" }[]; sameCore: boolean }
export interface Target { title: string; why: string; where: string; tag: string }
type Grades = Record<"clear" | "boss" | "survive", Grade>;
// Home's three columns for one job: what you wear, the strongest you own (the 100 mark), and the best possible.
export interface Compare {
  role: string; goal: Goal;
  now?: { spec: BuildView["spec"]; rating: number; grades: Grades; artifact?: { tune: ArtifactTune; rating: number; gain: number } };
  own: { view: BuildView; rating: number; grades: Grades; changes: string[] };
  best: { view: BuildView; rating: number; grades: Grades; missing: number };
}
// One line of the farm list: what to get, what it replaces, where it drops and what it adds to your strongest build.
export interface FarmRow { kind: "farm" | "upgrade" | "power"; title: string; detail?: string; replaces?: string; where: string; gain?: number; role: string; inBuilds?: number }
export interface MaxHunter {
  cls: string; // Hunter, Warlock
  pct: number;
  pillars: { power: number; gear: number; builds: number };
  partial: boolean; // true while the best-possible check hasn't run yet
  power: number;
  lowestSlot?: { slot: string; power: number };
  kit: { role: string; goal: Goal; view: BuildView }[];
  best: { role: string; view: BuildView }[];
  path: PathStep[];
  reports: Report[];
  now?: { rating: number; spec: BuildView["spec"]; grades: Record<"clear" | "boss" | "survive", Grade>; notes: Record<"clear" | "boss" | "survive", string> }; // what you're wearing, rated against your best Max Hunter build (same yardstick as the Builder)
  possible: Possible[]; // per role: the strongest Hunter possible (any exotic in the game, everything masterworked) and how to get there
  targets: Target[]; // gear to chase next
  compare: Compare[];
  farm: FarmRow[]; // ranked by what each adds to your strongest build
}

type DefOf = (h: number) => ItemDef | undefined;

const CTX = new WeakMap<Inventory, ReturnType<typeof makeCtx>>();
function ctxFor(inv: Inventory, defOf: DefOf, defs: ItemDef[], characterId: string) {
  let c = CTX.get(inv);
  if (!c || c.characterId !== characterId) { c = makeCtx(inv, defOf, defs, characterId); CTX.set(inv, c); }
  return c;
}
function bestBuild(inv: Inventory, defOf: DefOf, defs: ItemDef[], characterId: string, goal: Goal, settings: Settings): BuildView | undefined {
  const ctx = ctxFor(inv, defOf, defs, characterId);
  const found = searchBuilds({ inv, defOf, defs, characterId, goal, top: 5 }).map(specFromBuild);
  return found.map(sp => evaluate({ ...sp, goal }, ctx, settings))
    .sort((a, b) => a.issues.length - b.issues.length || b.score - a.score)[0];
}

// withBest: false skips the best-possible searches (half the work) so Home can show your path sooner.
export function maxHunter(inv: Inventory, defOf: DefOf, defs: ItemDef[], characterId: string, catalog: CatalogEntry[], progress?: (m: string) => void, withBest = true): MaxHunter {
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
  for (const [role, goal] of withBest ? roles : []) {
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
      path.push({ what: src?.acquired ? `Pull ${it.name} from Collections` : `Get ${farmName(it, view)}`, why: `Raises your ${role.toLowerCase()} build${src?.source && !src.acquired ? `. Source: ${src.source}` : ""}`, gain: gain / missing.length, kind: "farm" });
    }
  });

  if (power < POWER_CAP) path.push({ what: "Run Solo Ops at Grade A or better", why: `Power ${Math.floor(power)} of ${POWER_CAP}. Raise your ${lowest.slot} first (${lowest.power})`, gain: WEIGHT.power * 100 * (1 - powerPct), kind: "power" });
  // Two copies of the same piece (one per build) read as one step.
  const merged = new Map<string, PathStep>();
  for (const st of path) { const m = merged.get(st.what); if (m) m.gain += st.gain; else merged.set(st.what, { ...st }); }
  path.splice(0, path.length, ...merged.values());
  path.sort((a, b) => b.gain - a.gain);

  // Reports: each kit build rated on every job against the best Steeped found for each.
  const ctx = makeCtx(inv, defOf, defs, characterId);
  const rate = (v: BuildView, goal: Goal) => evaluate({ ...v.spec, goal }, ctx, settings).score;
  const jobs: [keyof Report["stars"], Goal][] = [["clear", "whole"], ["boss", "bossDps"], ["survive", "survival"]];
  // Survive is judged against a real best-survival build, not just the other builds in your kit.
  const survivalBest = withBest ? bestBuild(inv, defOf, defs, characterId, "survival", settings) : undefined;
  const all = [...kit.map(k => k.view), ...best.map(b => b.view).filter(v => !hasStandIn(v)), ...(survivalBest ? [survivalBest] : [])];
  const top = Object.fromEntries(jobs.map(([j, g]) => [j, Math.max(...all.map(v => rate(v, g)), 1)])) as Record<keyof Report["stars"], number>;
  const reports: Report[] = kit.map(({ role, view }) => {
    const stars = Object.fromEntries(jobs.map(([j, g]) => [j, starsFor(rate(view, g) / top[j])])) as Report["stars"];
    const order = (Object.entries(stars) as [keyof Report["stars"], number][]).sort((a, b) => b[1] - a[1]);
    const label = { clear: "clearing rooms", boss: "boss damage", survive: "staying alive" };
    const { confidence, why: confidenceWhy } = confidenceOf(view, role === "Boss damage");
    const cost = path.filter(p => p.kind === "gear" && [...Object.values(view.armor?.pieces ?? {}).map(x => x.item.name), ...view.weapons.map(w => w?.item.name)].some(n => n && p.what.endsWith(n))).map(p => p.what);
    const solo = view.loops.survives.length === 0;
    return {
      role, stars, view, confidence, confidenceWhy, cost,
      verdict: role === "Max Hunter"
        ? `Your best all-round build${solo ? ", and it can carry you solo" : ""}.`
        : `Swap to this for damage phases.`,
      why: view.loops.combos.slice(0, 3).map(c => ({ name: c.name, play: c.play })),
      shines: `Best at ${label[order[0][0]]} (${order[0][1]} of 5).`,
      struggles: order[2][1] >= 4.5 ? "Strongest of your builds at all three jobs." : `Weakest at ${label[order[2][0]]} (${order[2][1]} of 5).${order[2][0] === "boss" && role !== "Boss damage" ? " Swap to your Boss build for damage phases." : ""}`,
    };
  });

  const nowView = evaluateNow(ctx, "whole", settings);
  const bestScore = Math.max(...kit.filter(k => k.goal === "whole").map(k => k.view.score), nowView?.score ?? 0);
  let now: MaxHunter["now"];
  if (nowView && bestScore > 0) {
    const rating = Math.max(0, Math.min(100, Math.round((100 * nowView.score) / bestScore)));
    const graded = Object.fromEntries(jobs.map(([j, g]) => {
      const v = evaluateNow(ctx, g, settings);
      const gr = gradeOf((v?.score ?? 0) / top[j]);
      // A build that can't heal or soak damage can't survive solo, whatever its score says.
      return [j, j === "survive" && v?.loops.survives.length ? "Needs work" : gr];
    })) as Record<"clear" | "boss" | "survive", Grade>;
    const notes = {
      clear: `${rating} of 100 next to your best build`,
      boss: graded.boss === "Great" ? "Strong on bosses as it is" : "Swap to your Boss build for damage phases",
      survive: nowView.loops.survives.length ? `Missing ${nowView.loops.survives.join(" and ")}` : graded.survive === "Great" ? "Heals and soaks damage solo" : "Heals and soaks damage, but your best build does it better",
    };
    now = { rating, spec: nowView.spec, grades: graded, notes };
  }

  // Best possible per role, perfected: the strongest build with any exotic in the game, every piece masterworked.
  const possible: Possible[] = [];
  for (const { role, goal, view: mine } of kit) {
    const pick = best.find(b => b.role === role)?.view ?? mine;
    const pctx = hasStandIn(pick) ? ctxFor(wc.inv, defOf, defs, characterId) : ctx;
    // Same core as your build: keep the exact pieces and masterwork them, so "perfected" never trades a stat away.
    const same = pick === mine || (pick.spec.exotic === mine.spec.exotic && pick.spec.subclass === mine.spec.subclass);
    const locks = same ? Object.fromEntries(Object.entries(mine.armor?.pieces ?? {}).map(([sl, p]) => [sl, p.item.id])) : {};
    const perfected = evaluate({ ...pick.spec, goal, armorLocks: { ...pick.spec.armorLocks, ...locks } }, pctx, { ...settings, mw: "full" });
    const steps: Possible["steps"] = [];
    for (const it of [...perfected.weapons.filter(Boolean).map(w => w!.item), ...Object.values(perfected.armor?.pieces ?? {}).map(p => p.item)].filter(isStandIn)) {
      const src = standInSource(it.id);
      steps.push({ kind: "get", what: src?.acquired ? `Pull ${it.name} from Collections` : `Get ${farmName(it, perfected)}`, why: src?.source ? `Source: ${src.source}` : "Not in your collection yet" });
    }
    const notMw = Object.values(perfected.armor?.pieces ?? {}).filter(p => !p.item.masterworked && !isStandIn(p.item)).map(p => p.item.name);
    if (notMw.length) steps.push({ kind: "gear", what: `Masterwork ${notMw.join(", ")}`, why: "Full stats on every piece" });
    for (const w of perfected.weapons) if (w?.infuse) steps.push({ kind: "gear", what: `Infuse ${w.item.name}`, why: `It's Power ${w.item.power}` });
    for (const w of perfected.weapons) if (w && !w.item.exotic && w.tier > 0 && w.tier < 5) steps.push({ kind: "gear", what: `Upgrade ${w.item.name} to Tier 5`, why: "Weapon Tier Upgrading unlocks its enhanced perks" });
    if (power < POWER_CAP) steps.push({ kind: "power", what: "Reach Power 550", why: "Solo Ops at Grade A or better" });
    possible.push({ role, view: perfected, steps, sameCore: pick.spec.exotic === mine.spec.exotic && pick.spec.subclass === mine.spec.subclass });
  }

  // Gear to target: your lowest slot, the stats holding your main build back, weapon upgrades, and exotics to get.
  const targets: Target[] = [];
  if (power < POWER_CAP) {
    const kind = ["kinetic", "energy", "power"].includes(lowest.slot) ? "weapon" : "armor";
    targets.push({ title: `Any ${lowest.slot} ${kind} above ${lowest.power} Power`, why: `Your best ${lowest.slot} ${kind} is ${lowest.power}, your lowest slot. Infuse the drop into the piece you like and your Power goes up.`, where: "Solo Ops at Grade A or better", tag: "Power" });
  }
  const main = possible.find(p => p.role === "Max Hunter")?.view ?? kit[0]?.view;
  if (main?.ratingPlan) {
    const short = STAT_ORDER.filter(k => (main.ratingPlan![k]?.low ?? 0) >= 0.9 && main.stats[k] < 100) as StatKey[];
    if (short.length) targets.push({ title: `Armor with high ${short.map(k => STAT_LABEL[k]).join(" or ")} rolls`, why: `${short.map(k => `${STAT_LABEL[k]} ${main.stats[k]}`).join(", ")} in your best build even when perfected. Keep Tier 5 pieces that roll high here.`, where: "Any Grade A+ activity", tag: "Stats" });
  }
  for (const p of path.filter(x => x.what.startsWith("Upgrade "))) targets.push({ title: p.what.replace("Upgrade ", ""), why: p.why, where: "Weapon Tier Upgrading", tag: "Upgrade" });
  for (const p of path.filter(x => x.kind === "farm")) targets.push({ title: p.what.replace(/^(Get|Pull) /, "").replace(/ from Collections$/, ""), why: p.why, where: p.why.split("Source: ")[1] ?? "Collections", tag: /\(Tier 5/.test(p.what) ? "God roll" : "Exotic" });

  // Home: three columns per job and one ranked farm list.
  const compare: Compare[] = [], farm: FarmRow[] = [];
  const wctx = ctxFor(wc.inv, defOf, defs, characterId);
  const gradesOf = (v: BuildView, c: typeof ctx, set: Settings): Grades => Object.fromEntries(jobs.map(([j, g]) => {
    const e = evaluate({ ...v.spec, goal: g }, c, set);
    return [j, j === "survive" && e.loops.survives.length ? "Needs work" : gradeOf(e.score / top[j])];
  })) as Grades;
  const full: Settings = { ...settings, mw: "full" };
  const nameOf = (id: string | undefined) => (id ? inv.items.find(i => i.id === id)?.name : undefined);
  // Tune my artifact: the build you wear with the best of all seven artifacts, rated on the same yardstick.
  const artTune = (goal: Goal, ownScore: number) => {
    const tune = tuneArtifactNow(ctx, goal, settings);
    if (!tune) return undefined;
    return { tune, rating: Math.min(100, Math.round((100 * tune.best.score) / ownScore)), gain: Math.round((100 * tune.gain) / ownScore) };
  };
  for (const { role, goal, view: own } of kit) {
    const best = possible.find(p => p.role === role)!.view;
    const nowV = evaluateNow(ctx, goal, settings);
    const changes: string[] = [];
    if (nowV) {
      const a = nowV.spec, b = own.spec;
      if (a.subclass !== b.subclass) changes.push(`${b.subclass} instead of ${a.subclass}`);
      if (a.exotic !== b.exotic) changes.push(`${b.exotic} instead of ${a.exotic}`);
      for (const k of ["super", "grenade", "melee", "classAbility"] as const) if (a[k] !== b[k]) changes.push(`${b[k]} instead of ${a[k]}`);
      for (const x of b.aspects) if (!a.aspects.includes(x)) changes.push(`Aspect: ${x}`);
      if (b.artifact && b.artifact !== a.artifact) changes.push(`Artifact: ${b.artifact}`);
      b.weapons.forEach((id, i) => { const n = nameOf(id); if (n && n !== nameOf(a.weapons[i])) changes.push(n); });
      for (const x of b.fragments) if (!a.fragments.includes(x)) changes.push(x);
      // Armor set bonuses the strongest build turns on that what you wear doesn't.
      const setsOf = (v: BuildView) => { const n = new Map<number, number>(); for (const p of Object.values(v.armor?.pieces ?? {})) if (p.set) n.set(p.set, (n.get(p.set) ?? 0) + 1); return n; };
      const was = setsOf(nowV);
      for (const [h, c] of setsOf(own)) {
        const st = ctx.sets.get(h);
        const on = st?.perks.filter(x => c >= x.count && !((was.get(h) ?? 0) >= x.count)).map(x => x.k.name) ?? [];
        if (st && on.length) changes.unshift(`${st.name.replace(/ Set$/, "")} set (${c >= 4 ? 4 : 2} pieces): ${on.join(", ")}`);
      }
    }
    compare.push({
      role, goal,
      now: nowV ? { spec: nowV.spec, rating: Math.min(100, Math.round((100 * nowV.score) / own.score)), grades: gradesOf(nowV, ctx, settings), artifact: artTune(goal, own.score) } : undefined,
      own: { view: own, rating: 100, grades: gradesOf(own, ctx, settings), changes },
      best: { view: best, rating: Math.round((100 * best.score) / own.score), grades: gradesOf(best, hasStandIn(best) ? wctx : ctx, full), missing: [...best.weapons.filter(Boolean).map(w => w!.item), ...Object.values(best.armor?.pieces ?? {}).map(p => p.item)].filter(isStandIn).length },
    });
    // What each missing piece adds: put just that piece into your strongest build (both fully masterworked).
    const base = evaluate({ ...own.spec, goal }, wctx, full);
    const ownArmor = Object.values(own.armor?.pieces ?? {}).map(p => p.item);
    best.weapons.forEach((w, i) => {
      if (!w || !isStandIn(w.item)) return;
      const ws = [...own.spec.weapons]; ws[i] = w.item.id;
      const v = evaluate({ ...own.spec, goal, weapons: ws, weaponPerks: { ...own.spec.weaponPerks, [w.item.id]: best.spec.weaponPerks?.[w.item.id] ?? [] } }, wctx, full);
      const perks = (best.spec.weaponPerks?.[w.item.id] ?? []).filter(Boolean);
      farm.push({ kind: "farm", role, title: w.item.name, detail: `Tier 5${perks.length ? `, ${perks.join(" + ")}` : ""}`, replaces: nameOf(own.spec.weapons[i]), where: standInSource(w.item.id)?.source || "Not in your collection yet", gain: (100 * (v.score - base.score)) / base.score });
    });
    for (const p of Object.values(best.armor?.pieces ?? {})) {
      if (!isStandIn(p.item)) continue;
      const src = standInSource(p.item.id);
      farm.push({ kind: "farm", role, title: src?.acquired ? `Pull ${p.item.name} from Collections` : p.item.name, detail: "Exotic armor", replaces: own.spec.exotic, where: src?.source || "Not in your collection yet", gain: (100 * (best.score - base.score)) / base.score });
    }
    const notMw = ownArmor.filter(i => !i.masterworked);
    if (notMw.length) {
      const asIs = own.score;
      const mw = evaluate({ ...own.spec, goal }, ctx, full).score;
      farm.push({ kind: "upgrade", role, title: `Masterwork ${notMw.map(i => i.name).join(", ")}`, where: "Upgrade materials", gain: (100 * (mw - asIs)) / asIs });
    }
    for (const w of own.weapons) if (w && !w.item.exotic && w.tier > 0 && w.tier < 5) farm.push({ kind: "upgrade", role, title: `Upgrade ${w.item.name} to Tier 5`, where: "Weapon Tier Upgrading", detail: "Unlocks its enhanced perks" });
    for (const w of own.weapons) if (w?.infuse) farm.push({ kind: "upgrade", role, title: `Infuse ${w.item.name}`, where: `It's Power ${w.item.power}` });
  }
  // Same piece for two jobs: keep it once, with the bigger gain.
  const byTitle = new Map<string, FarmRow>();
  for (const r of farm) { const c = byTitle.get(r.title); if (!c || (r.gain ?? -1) > (c.gain ?? -1)) byTitle.set(r.title, c ? { ...r, role: `${c.role} and ${r.role}` } : r); }
  // A piece that makes your strongest build weaker on its own isn't worth farming, whatever a combo elsewhere says.
  farm.splice(0, farm.length, ...[...byTitle.values()].filter(r => r.kind !== "farm" || (r.gain ?? 0) > 0.05));
  // How many top community builds use it (knowledge/research/builds.json).
  for (const r of farm) if (r.kind === "farm") {
    const name = r.title.replace(/^Pull /, "").replace(/ from Collections$/, "");
    r.inBuilds = BUILDS.filter(b => b.exotic === name || b.weapons.some(w => w.name === name)).length;
  }
  farm.sort((a, b) => (b.gain ?? 0.5) - (a.gain ?? 0.5));
  if (power < POWER_CAP) farm.unshift({ kind: "power", role: "Power", title: `Any ${lowest.slot} above ${lowest.power} Power`, detail: `Power ${Math.floor(power)} of ${POWER_CAP}, lowest slot: ${lowest.slot}`, where: "Solo Ops at Grade A or better" });

  const pct = 100 * (WEIGHT.power * powerPct + WEIGHT.gear * gearPct + WEIGHT.builds * buildsPct);
  return { cls: inv.characters.find(c => c.id === characterId)?.cls ?? "Hunter", partial: !withBest, pct, pillars: { power: powerPct * 100, gear: gearPct * 100, builds: buildsPct * 100 }, power, lowestSlot: lowest, kit, best, path, reports, now, possible, targets, compare, farm };
}

const hasStandIn = (v: BuildView) => [...v.weapons.filter(Boolean).map(w => w!.item), ...Object.values(v.armor?.pieces ?? {}).map(p => p.item)].some(isStandIn);
// 100% of the best = 5 stars; every 6% short drops half a star.
const starsFor = (ratio: number) => Math.max(1, Math.min(5, Math.round((5 - (1 - ratio) * (5 / 0.6) * 1) * 2) / 2));

// How much of the build rests on rules a person checked, versus Bungie's text read by Steeped or weapon type alone.
function confidenceOf(v: BuildView, boss: boolean): { confidence: Confidence; why: string } {
  const parts = [...v.coreParts.map(p => p.k), ...v.perkParts.map(p => p.k), ...v.weapons.flatMap(w => (w ? w.ks : []))];
  const read = parts.filter(k => (k as { read?: string }).read === "description").length;
  const share = parts.length ? read / parts.length : 0;
  const typeOnly = v.weapons.filter(w => w && !w.rated).length;
  let c: Confidence = share < 0.1 && typeOnly === 0 ? "Proven" : share < 0.3 ? "Mostly proven" : "Best guess";
  const guessed = [...new Set(parts.filter(k => (k as { read?: string }).read === "description").map(k => k.name))];
  const bits = [read ? `Rests partly on Steeped's reading of ${guessed.slice(0, 4).join(", ")}${guessed.length > 4 ? ` and ${guessed.length - 4} more` : ""}` : "Every piece is a proven rule"];
  if (typeOnly) bits.push(`${typeOnly} weapon${typeOnly > 1 ? "s" : ""} judged by type only`);
  if (boss) { if (c === "Proven") c = "Mostly proven"; bits.push("no real damage numbers yet, so heavy and boss picks are judgment"); }
  return { confidence: c, why: bits.join("; ") };
}
