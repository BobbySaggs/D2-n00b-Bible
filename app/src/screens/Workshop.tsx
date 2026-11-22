import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ARMOR_SLOTS, STAT_LABEL, STAT_ORDER, type Slot } from "../bungie/config";
import { DEFS } from "../bungie/defs";
import type { Inventory, Item } from "../model/inventory";
import { HUNTER, byName, type K, type Subclass } from "../knowledge/hunter";
import type { ArtifactPerk } from "../knowledge/artifact";
import { breakdown, currentSpec, evaluate, evaluateNow, fragmentSlots, makeCtx, refitArtifact, tuneCurrent, type BuildSpec, type BuildView, type Ctx, type Settings } from "../engine/evaluate";
import { placePerks } from "../engine/artifact";
import { isPvp, type Goal } from "../engine/loops";
import { WSTAT_LABEL } from "../knowledge/pvp";
import type { Require, Weapon } from "../engine/builds";
import { runSearch } from "../workers/search";
import { Badge, Button, Card, cn } from "../ui/kit";
import { Delta, Segmented, Spinner } from "../ui/bits";
import { GearIcon, LoadoutFigure, iconForName } from "../ui/gear";
import { StatTargetsBar, loadTargets } from "../ui/targets";
import { GOALS, HowItWorks, HowToPlay, PointsPanel, word } from "./Builder";

// The Workshop: you pick, Steeped explains. Click a slot and every option you own for it is tried in your build
// and ranked by what it really does, with where each claim comes from.

type SlotId =
  | { kind: "super" | "grenade" | "melee" | "classAbility" | "exotic" | "artifact" | "subclass" }
  | { kind: "aspect" | "fragment" | "weapon" | "perk"; i: number };
const slotKey = (s: SlotId) => ("i" in s ? `${s.kind}${s.i}` : s.kind);

type Source = "checked" | "bungie" | "frame" | "unrated" | "stats";
const SOURCE: Record<Source, { label: string; tone: "good" | "neutral" | "warn"; tip: string }> = {
  checked: { label: "Checked", tone: "good", tip: "Claude wrote this rule from Bungie's own text and patch notes, and checked it by hand." },
  bungie: { label: "From Bungie's text", tone: "neutral", tip: "Steeped read this from the item's own description. Bungie's words are shown so you can check the reading." },
  frame: { label: "Weapon type only", tone: "warn", tip: "Steeped knows this weapon's type but not its perks, so only the frame counts." },
  unrated: { label: "Not rated", tone: "warn", tip: "Steeped doesn't understand this yet, so it counts as neutral instead of guessing." },
  stats: { label: "Bungie's stats", tone: "good", tip: "Rated for duels from this roll's own stats from Bungie (range, handling, stability, aim assist, airborne, reload). How much each stat matters per weapon type is Steeped's judgment." },
};

interface Option {
  key: string;
  label: string;
  icon?: string;
  apply: (s: BuildSpec) => BuildSpec;
  quick: boolean; // armor stays as it is (weapons, artifact perks): only the loops change
  source: Source;
  says?: string;
  bungie?: string;
  where?: string;
  current: boolean;
}
interface Tried { o: Option; v: BuildView; gained: string[]; lost: string[]; nowIdle: string[]; nowFed: string[] }

type Ref = { score: number; loop: number; stat: number };
const BEST = new Map<string, BuildSpec | null>();
export interface Sent { col: 0 | 1; spec: BuildSpec }

// Browser storage: the Workshop build survives switching tabs, and named builds survive reloads. Storage can be
// missing or full, so every read and write is allowed to fail quietly.
const WS_KEY = "steeped-workshop", SAVES_KEY = "steeped-saved-builds";
interface Saved { name: string; goal: Goal; spec: BuildSpec; at: number }
const readJSON = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
const writeJSON = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const pct = (x: number, of: number) => (of > 0 ? Math.round((100 * x) / of) : 0);

export function Workshop({ inv, onSend }: { inv: Inventory; onSend: (s: Sent) => void }) {
  const hunter = inv.characters.find(c => c.cls === "Hunter");
  const ctx = useMemo<Ctx | null>(() => (hunter ? makeCtx(inv, h => DEFS.get(h), [...DEFS.values()], hunter.id) : null), [inv, hunter]);
  const [goal, setGoal] = useState<Goal>(() => readJSON<BuildSpec | null>(WS_KEY, null)?.goal ?? "whole");
  const [locks, setLocks] = useState<Set<string>>(new Set());
  const [saves, setSaves] = useState<Saved[]>(() => readJSON<Saved[]>(SAVES_KEY, []));
  const [msg, setMsg] = useState("");
  const [targets, setTargets] = useState(loadTargets);
  const [style, setStyle] = useState<"peaks" | "even">("peaks");
  const settings: Settings = { targets, mw: "asIs", style, tune: true };
  const settingsKey = JSON.stringify(targets) + style; // re-evaluate when targets or style change
  const [spec, setSpec] = useState<BuildSpec | null>(null);
  const [best, setBest] = useState<BuildSpec | null>(null);
  const [sel, setSel] = useState<SlotId>({ kind: "grenade" });
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!ctx) return;
    setSpec(s => (s ? { ...s, goal } : readJSON<BuildSpec | null>(WS_KEY, null) ?? currentSpec(ctx, goal)));
    // The 100 mark only changes when your gear or the goal does, so it's kept between tab switches.
    const key = `${inv.loadedAt}|${goal}|${settingsKey}`;
    if (BEST.has(key)) { setBest(BEST.get(key)!); return; }
    setBest(null);
    runSearch({ characterId: ctx.characterId, goal, top: 1, settings }, inv, ctx.defs).then(f => { BEST.set(key, f[0] ?? null); setBest(f[0] ?? null); }).catch(() => setBest(null));
  }, [ctx, goal, inv, settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (spec) writeJSON(WS_KEY, spec); }, [spec]);
  const view = useMemo(() => (spec && ctx ? evaluate({ ...spec, goal }, ctx, settings) : null), [spec, ctx, goal, settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const now = useMemo(() => (ctx ? evaluateNow(ctx, goal, settings) : null), [ctx, goal, settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const bestView = useMemo(() => (best && ctx ? evaluate({ ...best, goal }, ctx, settings) : null), [best, ctx, goal, settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const ref: Ref | null = useMemo(() => {
    if (!bestView) return null; // no rating until the 100 mark is known: a rating against nothing would mislead
    const all = [bestView, now, view].filter((x): x is BuildView => !!x);
    return all.length ? { score: Math.max(...all.map(x => x.score)), loop: Math.max(...all.map(x => x.loopScore)), stat: Math.max(...all.map(x => x.statScore)) } : null;
  }, [bestView, now, view]);

  const options = useMemo(() => (ctx && view ? optionsFor(sel, view, ctx) : []), [sel, view, ctx]);
  const tried = useMemo<Tried[]>(() => {
    if (!ctx || !view) return [];
    const lockArmor = Object.fromEntries(ARMOR_SLOTS.map(s => [s, view.armor?.pieces[s]?.item.id]).filter(([, id]) => id)) as Partial<Record<Slot, string>>;
    const combos = new Set(view.loops.combos.map(c => c.name)), idle = new Set(view.loops.unfed.map(u => u.name));
    return options.map(o => {
      const next = o.apply(view.spec);
      const v = evaluate({ ...next, goal, armorLocks: o.quick ? lockArmor : next.armorLocks }, ctx, settings);
      const after = new Set(v.loops.combos.map(c => c.name)), afterIdle = new Set(v.loops.unfed.map(u => u.name));
      return {
        o, v,
        gained: [...after].filter(c => !combos.has(c)), lost: [...combos].filter(c => !after.has(c)),
        nowIdle: [...afterIdle].filter(n => !idle.has(n)), nowFed: [...idle].filter(n => !afterIdle.has(n) && namesOf(v).has(n)),
      };
    }).sort((a, b) => b.v.score - a.v.score);
  }, [options, view, ctx, goal, settingsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hunter || !ctx) return <Card>The Workshop knows Hunters first.</Card>;
  if (!spec || !view) return <Card><Spinner label="Reading your build" /></Card>;

  const r = (v: BuildView) => (ref ? pct(v.score, ref.score) : 0);
  const start = async (from: "now" | "tuned" | "best") => {
    if (from === "now") setSpec(currentSpec(ctx, goal));
    if (from === "tuned") setSpec(tuneCurrent(ctx, goal));
    if (from === "best") setSpec(best);
  };
  const toggle = (id: SlotId) => setLocks(l => { const n = new Set(l); const k = slotKey(id); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  // "Fill the rest": everything locked stays exactly as it is; Steeped picks the best of everything else.
  const fill = async () => {
    const s = view.spec, has = (k: string) => locks.has(k);
    const pp = perkSlots(view);
    const req: Require = {
      subclass: s.subclass,
      ...(has("super") && { super: s.super }), ...(has("grenade") && { grenade: s.grenade }), ...(has("melee") && { melee: s.melee }),
      ...(has("classAbility") && { classAbility: s.classAbility }), ...(has("exotic") && { exotic: s.exotic }),
      aspects: [0, 1].filter(i => has(`aspect${i}`) && s.aspects[i]).map(i => s.aspects[i]),
      fragments: s.fragments.filter((f, i) => has(`fragment${i}`) && f),
      ...((has("artifact") || pp.some((p, i) => p && has(`perk${i}`))) && { artifact: view.artifact?.name }),
      artifactPerks: pp.map((p, i) => (p && has(`perk${i}`) ? p.name : "")).filter(Boolean),
    };
    if (!has("subclass") && ![...locks].some(k => /^(super|grenade|melee|classAbility|aspect|fragment)/.test(k))) delete req.subclass;
    const pinned = [0, 1, 2].filter(i => has(`weapon${i}`) && s.weapons[i]).map(i => s.weapons[i]);
    setBusy("Filling the rest around your locks"); setMsg("");
    try {
      const f = await runSearch({ characterId: ctx.characterId, goal, top: 1, pinnedWeapons: pinned, require: req, settings }, inv, ctx.defs);
      if (f[0]) { setSpec(f[0]); setMsg(`Filled around ${locks.size} lock${locks.size === 1 ? "" : "s"}.`); }
      else setMsg("Nothing fits all of your locks together. Unlock one and try again.");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  const save = (name: string) => {
    const n = name.trim(); if (!n) return;
    const next = [{ name: n, goal, spec: view.spec, at: Date.now() }, ...saves.filter(x => x.name !== n)];
    setSaves(next); writeJSON(SAVES_KEY, next); setMsg(`Saved "${n}".`);
  };
  const remove = (name: string) => { const next = saves.filter(x => x.name !== name); setSaves(next); writeJSON(SAVES_KEY, next); };
  const switchSub = async (sub: Subclass) => {
    setBusy(`Building the best ${sub} around your exotic and weapons`);
    try {
      const f = await runSearch({ characterId: ctx.characterId, goal, top: 1, onlySubclass: sub, pinnedWeapons: spec.weapons.filter(Boolean), settings }, inv, ctx.defs);
      if (f[0]) setSpec(f[0]);
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-5" data-testid="workshop">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="What are you building for?" value={goal} options={GOALS} onChange={setGoal} />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Segmented label="Stat style" value={style} onChange={setStyle} options={[{ value: "peaks", label: "Most 100s" }, { value: "even", label: "Even spread" }]} />
          <span className="text-ink-dim">Start from</span>
          <Button size="sm" variant="ghost" onClick={() => start("now")}>What I'm wearing</Button>
          <Button size="sm" variant="ghost" onClick={() => start("tuned")}>My build, tuned</Button>
          <Button size="sm" variant="ghost" disabled={!best} onClick={() => start("best")}>{best ? "Steeped's best" : "Finding best…"}</Button>
        </div>
      </section>

      <Card className="p-3"><StatTargetsBar targets={targets} onChange={setTargets} stats={view.stats} /></Card>
      <Card className="flex flex-wrap items-center justify-between gap-4" data-testid="ws-rating">
        <div>
          <div className="font-display text-xl">Your Workshop build</div>
          <div className="text-sm"><span className="text-ink">{view.spec.subclass}</span> <span className="text-ink-dim">+</span> <span className="text-exotic">{view.spec.exotic || "no exotic"}</span>{view.artifact && <span className="text-ink-dim"> · {view.artifact.name}</span>}</div>
          <div className="text-xs text-ink-dim">100 = the best build Steeped can make from your gear for this goal{bestView ? ` (${bestView.spec.subclass} + ${bestView.spec.exotic})` : ""}.</div>
        </div>
        {!ref ? <Spinner label="Finding the best build your gear can make (the 100 mark)" /> : <div className="text-right">
          <div className="font-display leading-none"><span className="text-4xl" data-testid="ws-score">{Math.min(100, r(view))}</span><span className="text-sm text-ink-dim"> / 100</span></div>
          <div className="text-xs text-ink-dim">vs what you're wearing {now && <Delta v={r(view) - r(now)} />}</div>
          <div className="text-[11px] text-ink-dim">Synergy {Math.min(100, pct(view.loopScore, ref?.loop ?? 0))} · Stats {Math.min(100, pct(view.statScore, ref?.stat ?? 0))}</div>
        </div>}
      </Card>
      {busy && <Card><Spinner label={busy} /></Card>}
      {msg && !busy && <Card className="text-sm" data-testid="ws-msg">{msg}</Card>}

      <Card className="flex flex-wrap items-center gap-2 p-3" data-testid="ws-actions">
        <Button size="sm" disabled={!!busy || !locks.size} onClick={fill}>{locks.size ? `Fill the rest (${locks.size} locked)` : "Lock slots, then fill the rest"}</Button>
        {locks.size > 0 && <Button size="sm" variant="quiet" onClick={() => setLocks(new Set())}>Unlock all</Button>}
        <span className="mx-1 h-6 w-px bg-line" />
        <Button size="sm" variant="ghost" onClick={() => onSend({ col: 0, spec: { ...view.spec, goal } })}>Send to Best you own</Button>
        <Button size="sm" variant="ghost" onClick={() => onSend({ col: 1, spec: { ...view.spec, goal } })}>Send to Best possible</Button>
        <span className="text-xs text-ink-dim">Compare it in the Builder and use Equip in game there.</span>
        <SaveBox onSave={save} />
      </Card>
      {saves.length > 0 && (
        <Card className="space-y-1 p-3" data-testid="ws-saves">
          <div className="text-xs font-semibold uppercase tracking-wider text-accent-hi">Saved builds (this browser)</div>
          <ul className="space-y-1 text-sm">
            {saves.map(x => (
              <li key={x.name} className="flex flex-wrap items-center gap-2">
                <b>{x.name}</b><span className="text-xs text-ink-dim">{x.spec.subclass} + {x.spec.exotic} · {GOALS.find(g => g.value === x.goal)?.label} · {new Date(x.at).toLocaleDateString()}</span>
                <Button size="sm" variant="ghost" onClick={() => { setGoal(x.goal); setSpec({ ...x.spec, goal: x.goal }); setMsg(`Loaded "${x.name}".`); }}>Load</Button>
                <Button size="sm" variant="quiet" onClick={() => remove(x.name)}>Delete</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="space-y-1 p-3" data-testid="ws-slots">
          <SlotGroup title="Subclass">
            <SlotRow id={{ kind: "subclass" }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label="Subclass" value={view.spec.subclass} />
            <SlotRow id={{ kind: "super" }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label="Super" value={view.spec.super} icon={iconForName(view.spec.super)} />
            <SlotRow id={{ kind: "grenade" }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label="Grenade" value={view.spec.grenade} icon={iconForName(view.spec.grenade)} />
            <SlotRow id={{ kind: "melee" }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label="Melee" value={view.spec.melee} icon={iconForName(view.spec.melee)} />
            <SlotRow id={{ kind: "classAbility" }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label="Class ability" value={view.spec.classAbility} icon={iconForName(view.spec.classAbility)} />
            {[0, 1].map(i => <SlotRow key={i} id={{ kind: "aspect", i }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label={`Aspect ${i + 1}`} value={view.spec.aspects[i] ?? ""} icon={iconForName(view.spec.aspects[i] ?? "")} idle={isIdle(view, view.spec.aspects[i])} />)}
            {Array.from({ length: view.fragmentSlots }, (_, i) => <SlotRow key={i} id={{ kind: "fragment", i }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label={`Fragment ${i + 1}`} value={view.spec.fragments[i] ?? ""} icon={iconForName(view.spec.fragments[i] ?? "")} idle={isIdle(view, view.spec.fragments[i])} />)}
          </SlotGroup>
          <SlotGroup title="Gear">
            <SlotRow id={{ kind: "exotic" }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label="Exotic" value={view.spec.exotic} icon={iconForName(view.spec.exotic)} idle={isIdle(view, view.spec.exotic)} />
            {(["Kinetic", "Energy", "Heavy"] as const).map((l, i) => {
              const w = view.weapons[i];
              return <SlotRow key={l} id={{ kind: "weapon", i }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label={l} value={w?.item.name ?? ""} icon={w ? DEFS.get(w.item.hash)?.icon : undefined} />;
            })}
          </SlotGroup>
          {view.artifact && (
            <SlotGroup title="Artifact">
              <SlotRow id={{ kind: "artifact" }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label="Artifact" value={view.artifact.name} icon={DEFS.get(view.artifact.item.hash)?.icon} />
              {perkSlots(view).map((p, i) => <SlotRow key={i} id={{ kind: "perk", i }} sel={sel} setSel={setSel} locks={locks} toggle={toggle} label={`Perk ${i + 1}`} value={p?.name ?? ""} icon={p ? DEFS.get(p.hash)?.icon : undefined} idle={isIdle(view, p?.name)} />)}
            </SlotGroup>
          )}
          <div className="pt-2"><LoadoutFigure v={view} compact /></div>
        </Card>

        <Card className="space-y-3 p-3" data-testid="ws-options">
          {sel.kind === "subclass" ? (
            <SubclassPicker ctx={ctx} current={view.spec.subclass} onPick={switchSub} busy={!!busy} />
          ) : (
            <>
              <div>
                <h3 className="text-lg">Options for {slotTitle(sel)}</h3>
                <p className="text-xs text-ink-dim">Each option you own is tried in this build{sel.kind === "weapon" || sel.kind === "perk" ? " (armor kept as it is)" : " (armor and mods re-fit for it)"}, then ranked by the rating it would give. Click one to use it.</p>
              </div>
              {tried.length === 0 && <p className="text-sm text-ink-dim">Nothing else you own fits here.</p>}
              <ol className="space-y-2">
                {tried.map(t => <OptionRow key={t.o.key} t={t} base={view} r={r} onPick={() => setSpec(t.o.apply(view.spec))} />)}
              </ol>
              <Unrated sel={sel} view={view} ctx={ctx} />
            </>
          )}
        </Card>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3"><HowToPlay v={view} />{ref && <PointsPanel v={view} base={now} refScore={ref.score} open />}<h4 className="font-display text-base">How it works</h4><HowItWorks v={view} /></Card>
        <Card className="space-y-2"><h4 className="font-display text-base">Where every stat point comes from</h4><StatTable v={view} settings={settings} /></Card>
      </section>
    </div>
  );
}

// ---------- slots ----------
const namesOf = (v: BuildView) => new Set([...v.parts.map(p => p.name), ...v.artifactPerks.map(p => p.name), v.spec.exotic]);
const isIdle = (v: BuildView, name?: string) => !!name && v.loops.unfed.some(u => u.name === name);
const slotTitle = (s: SlotId) => ({ super: "Super", grenade: "Grenade", melee: "Melee", classAbility: "Class ability", exotic: "Exotic armor", artifact: "Artifact", subclass: "Subclass" } as Record<string, string>)[s.kind]
  ?? (s.kind === "aspect" ? `Aspect ${("i" in s ? s.i : 0) + 1}` : s.kind === "fragment" ? `Fragment ${("i" in s ? s.i : 0) + 1}` : s.kind === "perk" ? `Artifact perk ${("i" in s ? s.i : 0) + 1}` : ["Kinetic", "Energy", "Heavy"][("i" in s ? s.i : 0)] + " weapon");

function perkSlots(v: BuildView): (ArtifactPerk | undefined)[] {
  if (!v.artifact) return [];
  const placed = placePerks(v.artifact, v.spec.artifactPerks ?? []);
  return v.artifact.sockets.map(s => placed.find(p => p.socket === s.index)?.perk);
}

const SlotGroup = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="space-y-0.5"><div className="px-1 pt-2 text-xs font-semibold uppercase tracking-wider text-accent-hi">{title}</div>{children}</div>
);
function SlotRow({ id, sel, setSel, label, value, icon, idle, locks, toggle }: { id: SlotId; sel: SlotId; setSel: (s: SlotId) => void; label: string; value: string; icon?: string; idle?: boolean; locks: Set<string>; toggle: (s: SlotId) => void }) {
  const on = slotKey(id) === slotKey(sel), locked = locks.has(slotKey(id));
  return (
    <div className={cn("flex items-center gap-1 rounded-md hover:bg-panel", on && "bg-accent/20 ring-1 ring-accent/60")}>
      <button type="button" onClick={() => setSel(id)} data-testid={`ws-slot-${slotKey(id)}`} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm">
        <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-ink-dim">{label}</span>
        {icon ? <GearIcon src={icon} size={22} title={value} /> : <span className="inline-block h-[22px] w-[22px]" />}
        <span className={cn("truncate", !value && "text-ink-dim", idle && "text-warn")}>{value || "Empty"}</span>
        {idle && <span className="ml-auto shrink-0 text-[11px] text-warn">idle</span>}
      </button>
      <button type="button" onClick={() => toggle(id)} aria-pressed={locked} aria-label={`${locked ? "Unlock" : "Lock"} ${label}`} data-testid={`ws-lock-${slotKey(id)}`}
        title={locked ? "Locked: Fill the rest keeps this" : "Lock this so Fill the rest keeps it"}
        className={cn("mr-1 shrink-0 rounded px-1.5 py-0.5 text-xs", locked ? "bg-accent text-white" : "text-ink-dim hover:text-ink")}>{locked ? "Locked" : "Lock"}</button>
    </div>
  );
}

function SaveBox({ onSave }: { onSave: (n: string) => void }) {
  const [name, setName] = useState("");
  return (
    <form className="ml-auto flex items-center gap-2" onSubmit={e => { e.preventDefault(); onSave(name); setName(""); }}>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name this build" aria-label="Build name"
        className="h-9 w-40 rounded-md border border-line bg-panel-2 px-2 text-sm text-ink placeholder:text-ink-dim" />
      <Button size="sm" variant="ghost" type="submit" disabled={!name.trim()}>Save</Button>
    </form>
  );
}

// ---------- options ----------
const bungieText = (name: string) => [...DEFS.values()].find(d => d.name === name && d.desc && /hunter|shared|fragments|trinkets|totems|supers|grenades|melee|class_abilities|aspects/.test(d.plugCat))?.desc;
const whereOf = (it: Item, cid: string) => (it.owner === "vault" ? "in your vault" : it.owner === cid ? "on your Hunter" : "on another character");

function optionsFor(sel: SlotId, v: BuildView, ctx: Ctx): Option[] {
  const s = v.spec, sub = s.subclass, cid = ctx.characterId;
  const kit = ctx.kit.get(sub) ?? new Set<string>();
  const ability = (kind: K["kind"], cur: string, set: (n: string) => Partial<BuildSpec>): Option[] =>
    HUNTER.filter(k => k.kind === kind && k.subs?.includes(sub) && kit.has(k.name)).map(k => ({
      key: k.name, label: k.name, icon: iconForName(k.name), apply: sp => ({ ...sp, ...set(k.name) }), quick: false,
      source: "checked", says: k.says, bungie: bungieText(k.name), current: k.name === cur,
    }));
  switch (sel.kind) {
    case "super": return ability("super", s.super, n => ({ super: n }));
    case "grenade": return ability("grenade", s.grenade, n => ({ grenade: n }));
    case "melee": return ability("melee", s.melee, n => ({ melee: n }));
    case "classAbility": return ability("classAbility", s.classAbility, n => ({ classAbility: n }));
    case "aspect": {
      const i = sel.i, other = s.aspects[1 - i];
      return ability("aspect", s.aspects[i] ?? "", n => {
        const aspects = [...s.aspects]; aspects[i] = n;
        return { aspects, fragments: s.fragments.slice(0, fragmentSlots(aspects, sub)) };
      }).filter(o => o.key !== other);
    }
    case "fragment": {
      const i = sel.i, others = s.fragments.filter((_, j) => j !== i);
      return ability("fragment", s.fragments[i] ?? "", n => { const f = [...s.fragments]; f[i] = n; return { fragments: f.filter(Boolean) }; })
        .filter(o => !others.includes(o.key));
    }
    case "exotic": {
      const names = [...new Set(ctx.pieces.filter(p => p.exotic && p.item.cls === "Hunter").map(p => p.item.name))].filter(n => byName.has(n));
      return names.map(n => {
        const k = byName.get(n)!;
        const copies = ctx.pieces.filter(p => p.item.name === n && p.item.cls === "Hunter");
        const bestCopy = copies.sort((a, b) => b.item.power - a.item.power)[0];
        return {
          key: n, label: n, icon: iconForName(n), quick: false, source: "checked" as Source, says: k.says, current: n === s.exotic,
          where: bestCopy ? `${whereOf(bestCopy.item, cid)}, Tier ${bestCopy.tier}${bestCopy.mwLevel >= 5 ? ", masterworked" : ""}` : undefined,
          apply: (sp: BuildSpec) => { const l = { ...sp.armorLocks }; for (const sl of ARMOR_SLOTS) if (ctx.pieces.find(p => p.item.id === l[sl])?.exotic) delete l[sl]; return { ...sp, exotic: n, armorLocks: l }; },
        };
      });
    }
    case "weapon": {
      const slot = (["kinetic", "energy", "power"] as const)[sel.i];
      const otherExotic = s.weapons.some((id, j) => j !== sel.i && ctx.weapons.find(w => w.item.id === id)?.item.exotic);
      // One copy per weapon name (the highest Power), so the list is choices, not duplicates.
      const byNameBest = new Map<string, Weapon>();
      for (const w of ctx.weapons) if (w.item.slot === slot && !(w.item.exotic && otherExotic)) {
        const cur = byNameBest.get(w.item.name);
        if (!cur || w.item.id === s.weapons[sel.i] || (cur.item.id !== s.weapons[sel.i] && w.item.power > cur.item.power)) byNameBest.set(w.item.name, w);
      }
      return [...byNameBest.values()].map(w => {
        const perks = w.ks.filter(k => k.name !== w.item.name && k.name !== w.type).map(k => k.name);
        return {
          key: w.item.id, label: w.item.name, icon: DEFS.get(w.item.hash)?.icon, quick: true,
          source: (isPvp(s.goal) ? (w.duel !== undefined ? "stats" : "unrated") : w.rated ? "checked" : w.ks.length ? "frame" : "unrated") as Source,
          says: isPvp(s.goal)
            ? `${w.element} ${w.type} · duel rating ${w.duel?.toFixed(1) ?? "n/a"} / 10 · ` + (["range", "handling", "stability", "aim", "airborne", "reload"] as const).map(k => `${WSTAT_LABEL[k]} ${w.wstats[k] ?? 0}`).join(", ")
            : [w.element, w.type, perks.length ? `rated perks: ${perks.join(", ")}` : ""].filter(Boolean).join(" · "),
          where: `${whereOf(w.item, cid)}, Power ${w.item.power}${w.item.masterworked ? ", masterworked" : ""}${w.item.power < ctx.light - 60 ? " (needs infusing before it's usable at your Power)" : ""}`,
          current: w.item.id === s.weapons[sel.i],
          apply: (sp: BuildSpec) => { const ws = [...sp.weapons]; ws[sel.i] = w.item.id; return { ...sp, weapons: ws }; },
        };
      });
    }
    case "artifact":
      return ctx.artifacts.map(a => ({
        key: a.name, label: a.name, icon: DEFS.get(a.item.hash)?.icon, quick: true, source: "bungie" as Source, current: a.name === v.artifact?.name,
        says: "Perks picked for this build automatically. " + (DEFS.get(a.item.hash)?.desc ?? ""),
        apply: (sp: BuildSpec) => ({ ...sp, ...refitArtifact(sp, ctx, a.name) }),
      }));
    case "perk": {
      const art = v.artifact;
      if (!art) return [];
      const placed = perkSlots(v);
      const sock = art.sockets[sel.i];
      return sock.options.map(o => ({
        key: o.name, label: o.name, icon: DEFS.get(o.hash)?.icon, quick: true, current: placed[sel.i]?.name === o.name,
        source: (o.read !== "description" ? "checked" : "bungie") as Source, says: o.read !== "description" ? o.says : undefined, bungie: DEFS.get(o.hash)?.desc,
        apply: (sp: BuildSpec) => {
          const names = placed.map(p => p?.name);
          const was = names.indexOf(o.name);
          if (was >= 0) names[was] = names[sel.i]; // swap if it sits in another socket
          names[sel.i] = o.name;
          return { ...sp, artifactPerks: names.filter((n): n is string => !!n) };
        },
      }));
    }
  }
  return [];
}

function OptionRow({ t, base, r, onPick }: { t: Tried; base: BuildView; r: (v: BuildView) => number; onPick: () => void }) {
  const d = r(t.v) - r(base);
  const src = SOURCE[t.o.source];
  return (
    <li className={cn("rounded-md border border-line p-2.5", t.o.current && "border-accent/70 bg-accent/10")} data-testid="ws-option">
      <div className="flex items-start gap-2">
        {t.o.icon ? <GearIcon src={t.o.icon} size={30} title={t.o.label} /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-sm">{t.o.label}</b>
            {t.o.current && <Badge>current</Badge>}
            <span title={src.tip}><Badge tone={src.tone}>{src.label}</Badge></span>
          </div>
          {t.o.where && <div className="text-xs text-ink-dim">{t.o.where}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-lg leading-none">{r(t.v) ? Math.min(100, r(t.v)) : "…"}{r(t.v) > 100 && <span className="text-xs text-good"> new best</span>}</div>
          <div className="text-xs">{t.o.current ? <span className="text-ink-dim">now</span> : <Delta v={d} />}</div>
        </div>
      </div>
      {!t.o.current && (t.gained.length > 0 || t.lost.length > 0 || t.nowIdle.length > 0 || t.nowFed.length > 0) && (
        <ul className="mt-1.5 space-y-0.5 text-xs">
          {t.gained.length > 0 && <li className="text-good">Starts: {t.gained.join(", ")}</li>}
          {t.nowFed.length > 0 && <li className="text-good">Wakes up: {t.nowFed.join(", ")}</li>}
          {t.lost.length > 0 && <li className="text-bad">Breaks: {t.lost.join(", ")}</li>}
          {t.nowIdle.length > 0 && <li className="text-warn">Leaves idle: {t.nowIdle.map(n => `${n} (needs ${word(t.v.loops.unfed.find(u => u.name === n)?.token ?? "")})`).join("; ")}</li>}
        </ul>
      )}
      {(t.o.says || t.o.bungie) && (
        <details className="mt-1 text-xs text-ink-dim">
          <summary className="cursor-pointer">What it does</summary>
          {t.o.says && <p className="mt-1"><span className="text-ink">Steeped:</span> {t.o.says}</p>}
          {t.o.bungie && <p className="mt-1"><span className="text-ink">Bungie:</span> {t.o.bungie.replace(/\[[^\]]*\]/g, "")}</p>}
        </details>
      )}
      {!t.o.current && <div className="mt-1.5"><Button size="sm" variant="ghost" onClick={onPick}>Use this</Button></div>}
    </li>
  );
}

// Things you own for this slot that Steeped has no rule for: listed, never guessed.
function Unrated({ sel, view, ctx }: { sel: SlotId; view: BuildView; ctx: Ctx }) {
  const kindOf: Partial<Record<SlotId["kind"], RegExp>> = { super: /supers/, grenade: /grenades/, melee: /melee/, classAbility: /class_abilities/, aspect: /aspects|totems/, fragment: /fragments|trinkets/ };
  const re = kindOf[sel.kind];
  if (!re) return null;
  const sub = ctx.inv.items.find(i => i.kind === "subclass" && i.owner === ctx.characterId && i.name === view.spec.subclass);
  if (!sub) return null;
  const names = new Set<string>();
  for (const list of Object.values(sub.options)) for (const h of list) { const d = DEFS.get(h); if (d?.name && re.test(d.plugCat) && !byName.has(d.name) && !/^Empty/.test(d.name)) names.add(d.name); }
  if (!names.size) return null;
  return (
    <div className="space-y-1 border-t border-line pt-2 text-xs text-ink-dim">
      <p><Badge tone="warn">Not rated</Badge> You have these, but Steeped has no rule for them yet, so it won't guess:</p>
      <ul className="space-y-0.5">{[...names].map(n => <li key={n}><span className="text-ink">{n}</span>{bungieText(n) ? `: ${bungieText(n)!.replace(/\[[^\]]*\]/g, "")}` : ""}</li>)}</ul>
    </div>
  );
}

function SubclassPicker({ ctx, current, onPick, busy }: { ctx: Ctx; current: string; onPick: (s: Subclass) => void; busy: boolean }) {
  return (
    <div className="space-y-2">
      <h3 className="text-lg">Subclass</h3>
      <p className="text-xs text-ink-dim">Switching subclass changes every ability, so Steeped builds the best version of that subclass around your current weapons, then you can tweak it slot by slot.</p>
      <div className="flex flex-wrap gap-2">
        {[...ctx.kit.keys()].map(s => <Button key={s} size="sm" variant={s === current ? "primary" : "ghost"} disabled={busy || s === current} onClick={() => onPick(s)}>{s}</Button>)}
      </div>
    </div>
  );
}

function StatTable({ v, settings }: { v: BuildView; settings: Settings }) {
  const b = breakdown(v, settings, false);
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-ink-dim"><th className="py-1">Stat</th><th>Armor</th><th>Mods</th><th>Fragments</th><th>Total</th></tr></thead>
      <tbody>
        {STAT_ORDER.map(k => (
          <tr key={k} className="border-t border-line/60">
            <td className="py-1">{STAT_LABEL[k]}</td><td>{b.armor[k]}</td><td>{b.mods[k] ? `+${b.mods[k]}` : 0}</td><td>{b.fragments[k] > 0 ? `+${b.fragments[k]}` : b.fragments[k]}</td>
            <td className={cn("font-semibold", b.total[k] >= 100 ? "text-good" : b.total[k] < 50 ? "text-warn" : "")}>{b.total[k]}</td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={5} className="pt-2 text-xs text-ink-dim">Armor includes masterwork and tuning. 70 is where cooldowns are nearly maxed; past 100 adds damage.</td></tr></tfoot>
    </table>
  );
}
