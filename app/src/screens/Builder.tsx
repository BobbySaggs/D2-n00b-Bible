import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ARMOR_SLOTS, STAT_LABEL, STAT_ORDER, type Slot } from "../bungie/config";
import { DEFS } from "../bungie/defs";
import type { Inventory, Item } from "../model/inventory";
import { ALL, CLASS_SUBS, byName, type K, type Subclass } from "../knowledge/hunter";
import { breakdown, currentSlotMods, evaluate, pointsByPiece, refitArtifact, evaluateNow, fragmentSlots, fullModPlan, makeCtx, modPlan, modSteps, stepsFrom, type BuildSpec, type BuildView, type Ctx, type Settings } from "../engine/evaluate";
import type { Require } from "../engine/builds";
import { clearUndo, equipPlan, loadUndo, restorePlan, saveUndo, snapshotWorn, type WornSnapshot } from "../engine/equip";
import { EquipDialog } from "./EquipDialog";
import { count100, lowest } from "../engine/solve";
import type { Goal } from "../engine/loops";
import { runSearch } from "../workers/search";
import type { CatalogEntry } from "../bungie/catalog";
import { isStandIn, standInSource, withCatalog } from "../engine/catalog";
import { farmName } from "../engine/maxhunter";
import { useMax } from "../ui/useMax";
import { OptionRow, optionsFor, slotKey, tryOptions, type Option, type SlotId } from "./Workshop";
import { ArtifactLine, LoadoutGrid, Moment, gridFromView } from "../ui/visual";
import { Badge, Button, Card, cn } from "../ui/kit";
import { Delta, Pick, Segmented, Spinner } from "../ui/bits";
import { GearIcon, LoadoutFigure, MwLegend, iconForItem, iconForName } from "../ui/gear";
import { StatTargetsBar, loadTargets } from "../ui/targets";
import { MODE_NOTES, PVP_NOTES, WSTAT_LABEL } from "../knowledge/pvp";
import { useCharacter } from "../ui/character";
import { isPvp } from "../engine/loops";

export const GOALS: { value: Goal; label: string }[] = [
  { value: "whole", label: "All-round monster" },
  { value: "crucible", label: "Crucible" },
  { value: "trials", label: "Trials / Comp" },
  { value: "abilities", label: "Ability spam" },
  { value: "bossDps", label: "Boss damage" },
  { value: "survival", label: "Hard content" },
  { value: "team", label: "Team support" },
];
const SLOT_LABEL: Record<string, string> = { helmet: "Helmet", arms: "Arms", chest: "Chest", legs: "Legs", class: "Class item", kinetic: "Kinetic", energy: "Energy", power: "Heavy" };
const WORDS: Record<string, string> = {
  multikill: "pack kills", breach: "Void Breaches", champion: "champion stuns", ammo: "ammo",
  gEn: "grenade energy", mEn: "melee energy", cEn: "dodge energy", sEn: "super energy", orb: "Orbs of Power", orbPickup: "orbs",
  frost: "Frost Armor", shard: "Stasis shards", crystal: "Stasis crystals", shatter: "shatters", freeze: "freezes", slow: "slow",
  invis: "invisibility", weaken: "weaken", volatile: "volatile", overshield: "overshields", radiant: "radiant", scorch: "scorch",
  ignite: "ignitions", jolt: "jolt", amplified: "amplified", sever: "sever", kDebuffed: "debuffed kills", kMelee: "melee kills",
  kGrenade: "grenade kills", kPrecision: "precision kills", kSuper: "super kills", dodge: "dodges", heal: "healing", dr: "damage resistance",
  suppress: "suppress", tangle: "Tangles", bossDmg: "boss damage", teamBuff: "team buffs", reload: "reloads", restoration: "restoration", cure: "cure",
};
export const word = (t: string) => t.split(" or ").map(x => WORDS[x] ?? x).join(" or ");

const where = (i: Item, cid: string) =>
  i.owner === cid && i.equipped ? "Worn" : i.owner === cid ? "On character" : i.owner === "vault" ? "Vault" : "Other character";

type Col = 0 | 1;

// Every piece in a build: the stand-ins are what you'd still have to farm.
const gearOf = (v: BuildView) => [...v.weapons.filter(Boolean).map(w => w!.item), ...Object.values(v.armor?.pieces ?? {}).map(p => p.item)];
const needsFarm = (v: BuildView | null) => !!v && gearOf(v).some(isStandIn);

export function Builder({ inv, catalog = [], onRefresh, incoming, onIncomingUsed }: { inv: Inventory; catalog?: CatalogEntry[]; onRefresh?: () => void; incoming?: { col: Col; spec: BuildSpec } | null; onIncomingUsed?: () => void }) {
  const hunter = useCharacter(inv);
  // Gear you don't own joins as stand-ins, so the "best possible" column and the menu can use anything in the game.
  const ctx = useMemo<Ctx | null>(() => {
    if (!hunter) return null;
    const defs = [...DEFS.values()];
    const all = catalog.length ? withCatalog(inv, h => DEFS.get(h), catalog, hunter.id).inv : inv;
    return makeCtx(all, h => DEFS.get(h), defs, hunter.id);
  }, [inv, hunter, catalog]);
  const [goal, setGoal] = useState<Goal>(incoming?.spec.goal ?? "whole");
  const [settings, setSettings] = useState<Settings>(() => ({ targets: loadTargets(), mw: "asIs", style: "peaks", tune: true }));
  const [pinned, setPinned] = useState<string[]>([]);
  const [specs, setSpecs] = useState<(BuildSpec | null)[]>([null, null]);
  const [busy, setBusy] = useState<[boolean, boolean]>([false, false]);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState<Col>(0);
  const [showWhere, setShowWhere] = useState(false);
  const [req, setReq] = useState<Require>({});
  // Nothing customized: "Best possible" is the same answer Home gives (one shared search), so the two never disagree.
  const { m: max } = useMax(inv, catalog);
  const [shared, setShared] = useState(false);
  const [sharedOwn, setSharedOwn] = useState(false); // "Best from what you own" is Home's strongest build too
  const [equipping, setEquipping] = useState<Col | null>(null);
  const [undo, setUndo] = useState<WornSnapshot | null>(loadUndo);
  const [restoring, setRestoring] = useState(false);
  const [alts, setAlts] = useState<BuildSpec[]>([]); // Steeped's top builds for this goal, for Build B
  const [altIdx, setAltIdx] = useState(0); // on phones: compare Now with one build at a time
  const [best, setBest] = useState<BuildSpec | null>(null);
  const [fromWs, setFromWs] = useState<[boolean, boolean]>([false, false]); // column holds a build sent from the Workshop // Steeped's best for this goal with nothing locked: the 100 mark
  const [explain, setExplain] = useState(false);

  // Column A: the best from what you own. Column B: the best possible with anything in the game, fully masterworked.
  const search = async (cols: Col[], opts: { onlySubclass?: Subclass; onlyExotic?: string; require?: Require } = {}) => {
    if (!ctx) return;
    setBusy(b => [cols.includes(0) || b[0], cols.includes(1) || b[1]]);
    setErr("");
    const require = opts.require ?? (Object.keys(req).length ? req : undefined);
    const plain = !require && !opts.onlySubclass && !opts.onlyExotic && !pinned.length && (goal === "whole" || goal === "bossDps")
      && !Object.values(settings.targets ?? {}).some(Boolean) && settings.style === "peaks" && settings.tune !== false;
    const useShared = plain && incoming?.col !== 1;
    if (cols.includes(1)) setShared(useShared);
    if (cols.includes(0)) setSharedOwn(plain && incoming?.col !== 0);
    const one = async (c: Col) => {
      if (c === 1 && useShared) return; // filled from the shared Max Hunter result below
      try {
        const found = await runSearch({ characterId: ctx.characterId, goal, top: c === 1 ? 6 : 1, pinnedWeapons: pinned, ...opts, require, settings: c === 1 ? { ...settings, mw: "full" } : settings, catalog: c === 1 ? catalog : undefined }, inv, ctx.defs);
        if (c === 0 && !require && !opts.onlySubclass && !opts.onlyExotic && found[0]) setBest(found[0]);
        if (c === 0 && require && !best) runSearch({ characterId: ctx.characterId, goal, top: 1, pinnedWeapons: [], settings }, inv, ctx.defs).then(f => f[0] && setBest(f[0]));
        if (c === 1) { setAlts(found); setAltIdx(0); }
        setSpecs(s => { const n = [...s]; n[c] = found[0] ?? null; return n; });
        setFromWs(f => { const n = [...f] as [boolean, boolean]; n[c] = false; return n; });
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(b => { const n = [...b] as [boolean, boolean]; n[c] = false; return n; });
      }
    };
    await Promise.all(cols.map(one));
    if (incoming) {
      setSpecs(s => { const n = [...s]; n[incoming.col] = { ...incoming.spec, goal }; return n; });
      setFromWs(f => { const n = [...f] as [boolean, boolean]; n[incoming.col] = true; return n; });
      if (incoming.col === 1) setShared(false);
      onIncomingUsed?.();
    }
  };
  // Same strongest build as Home (one shared search), so aspect and fragment picks never disagree between pages.
  useEffect(() => {
    if (!sharedOwn || !max || fromWs[0]) return;
    const own = max.kit.find(k => k.goal === goal)?.view.spec;
    if (!own) return;
    setSpecs(s => { const n = [...s]; n[0] = own; return n; });
    setBest(own);
  }, [sharedOwn, max, goal, fromWs]);
  useEffect(() => {
    if (!shared || !max || max.partial || fromWs[1]) return;
    const role = max.kit.find(k => k.goal === goal)?.role;
    const p = max.possible.find(x => x.role === role);
    setSpecs(s => { const n = [...s]; n[1] = p?.view.spec ?? null; return n; });
    setAlts(p ? [p.view.spec] : []); setAltIdx(0);
    setBusy(b => [b[0], false]);
  }, [shared, max, goal, fromWs]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search([0, 1]); }, [ctx, goal, pinned.join(","), JSON.stringify(settings.targets), settings.style, settings.tune]);

  const now = useMemo(() => (ctx ? evaluateNow(ctx, goal, settings) : null), [ctx, goal, settings]);
  const views = useMemo(() => specs.map((s, c) => (s && ctx ? evaluate({ ...s, goal }, ctx, c === 1 ? { ...settings, mw: "full" } : settings) : null)), [specs, ctx, goal, settings]);
  const bestView = useMemo(() => (best && ctx ? evaluate({ ...best, goal }, ctx, settings) : null), [best, ctx, goal, settings]);
  // 100 = the strongest build Steeped can make from your gear for this goal (or whichever shown build beats it).
  const ref = useMemo(() => {
    // The yardstick is the best from your own gear, the same 100 as Home. "Best possible" shows how far past it it goes.
    const all = [bestView, now, views[0]].filter((x): x is BuildView => !!x);
    if (!all.length) return null;
    return { score: Math.max(...all.map(x => x.score)), loop: Math.max(...all.map(x => x.loopScore)), stat: Math.max(...all.map(x => x.statScore)) };
  }, [bestView, now, views]);
  const full = useMemo(() => specs.map(s => (s && ctx && settings.mw === "asIs" ? evaluate({ ...s, goal }, ctx, { ...settings, mw: "full" }) : null)), [specs, ctx, goal, settings]);

  if (!hunter || !ctx) return <Moment pose="ghost" title="No Hunter or Warlock on this account">Steeped builds for Hunters and Warlocks. Titan is next.</Moment>;
  // "Use this" from Try other options: the change shows right away in Best from what you own, and it's locked in
  // the menu so the next "Build it" (and Best possible) keeps it.
  const use = (sel: SlotId, o: Option, next: BuildSpec) => {
    setSharedOwn(false);
    setSpecs(s => { const n = [...s]; n[0] = next; return n; });
    if (sel.kind === "weapon") { const slot = (["kinetic", "energy", "power"] as const)[sel.i]; setPinned(p => [...p.filter(id => ctx.inv.items.find(i => i.id === id)?.slot !== slot), o.key]); return; }
    setReq(r => {
      const n: Require = { ...r, subclass: next.subclass };
      if (sel.kind === "super" || sel.kind === "grenade" || sel.kind === "melee" || sel.kind === "classAbility" || sel.kind === "exotic") n[sel.kind] = o.label;
      if (sel.kind === "aspect") n.aspects = [...new Set([...(r.aspects ?? []).filter(a => next.aspects.includes(a)), o.label])].slice(0, 2);
      if (sel.kind === "fragment") n.fragments = [...new Set([...(r.fragments ?? []).filter(f => next.fragments.includes(f)), o.label])];
      if (sel.kind === "artifact") { n.artifact = o.label; n.artifactPerks = undefined; }
      if (sel.kind === "perk") n.artifactPerks = [...new Set([...(r.artifactPerks ?? []), o.label])].slice(0, 2);
      return n;
    });
  };
  const beats = views[1] && ref ? Math.round((100 * views[1].score) / ref.score) - 100 : 0;
  const edit = (c: Col, patch: Partial<BuildSpec>) => setSpecs(s => { const n = [...s]; if (n[c]) n[c] = { ...n[c]!, ...patch }; return n; });

  return (
    <div className="space-y-5" data-testid="builds">
      <div>
        <h1 className="font-display text-3xl font-semibold">Builds</h1>
        <p className="text-ink-dim">Pick what you want, or leave it on Any. You get the best from what you own and the best in the game, with what to farm.</p>
      </div>
      <section className="space-y-3">
        <Segmented label="What are you building for?" value={goal} options={GOALS} onChange={setGoal} />
      </section>

      <BuildAround ctx={ctx} req={req} setReq={setReq} busy={busy[0]} onApply={r => search([0, 1], { require: r })} pinned={pinned} setPinned={setPinned} />

      <details className="rounded-2xl border border-line bg-panel/60 p-3 text-sm">
        <summary className="cursor-pointer text-ink-dim">More options: stat targets, stat style, tuning mods</summary>
        <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Segmented label="Stat style" value={settings.style} onChange={style => setSettings(s => ({ ...s, style }))}
            options={[{ value: "peaks", label: "Most 100s" }, { value: "even", label: "Even spread" }]} />
          <Segmented label="Masterwork" value={settings.mw} onChange={mw => setSettings(s => ({ ...s, mw }))}
            options={[{ value: "asIs", label: "Gear as is" }, { value: "full", label: "If masterworked" }]} />
          <label className="flex items-center gap-2 text-ink-dim">
            <input type="checkbox" checked={settings.tune !== false} onChange={e => setSettings(s => ({ ...s, tune: e.target.checked }))} /> Use tuning mods
          </label>
        </div>
      <div className="space-y-2">
        <StatTargetsBar targets={settings.targets} onChange={t => setSettings(s => ({ ...s, targets: t }))} />
        {Object.values(settings.targets).some(v => v !== undefined) && (
          <p className="text-xs text-ink-dim" data-testid="targets-note">Your stat targets decide which armor Steeped picks. Ratings don't change with them, so a build rates the same here and on Home. A missed target shows as a note on the build instead.</p>
        )}
      </div>
        </div>
      </details>
      {err && <Card className="border-bad/40 text-bad">{err}</Card>}
      {equipping !== null && views[equipping] && (
        <EquipDialog title={`${equipping ? "Best possible" : "Best you own"}: ${views[equipping]!.spec.subclass} + ${views[equipping]!.spec.exotic}`}
          steps={equipPlan(views[equipping]!, ctx)} who={{ membershipType: inv.account.membershipType, characterId: ctx.characterId }} slots={inv.loadouts?.[ctx.characterId]}
          onStart={() => { const s = snapshotWorn(ctx); saveUndo(s); setUndo(s); }}
          onClose={() => setEquipping(null)} onDone={() => onRefresh?.()} />
      )}
      {restoring && undo && (
        <EquipDialog title={`Undo: put back what you wore at ${new Date(undo.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
          intro="This puts back the gear, subclass, mods, tuning and artifact perks you had on before your last Equip"
          steps={restorePlan(undo, ctx)} who={{ membershipType: inv.account.membershipType, characterId: ctx.characterId }}
          onClose={() => setRestoring(false)} onDone={() => { clearUndo(); setUndo(null); onRefresh?.(); }} />
      )}
      {undo && undo.characterId === ctx.characterId && !restoring && equipping === null && (
        <Card className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-testid="undo-card">
          <span>Saved before your last Equip ({new Date(undo.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}): what you were wearing.</span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setRestoring(true)}>Undo: put it back</Button>
            <Button size="sm" variant="quiet" onClick={() => { clearUndo(); setUndo(null); }}>Dismiss</Button>
          </span>
        </Card>
      )}


      <section className="grid gap-3 md:grid-cols-3">
        <ScoreCard title="Now" sub="What you're wearing" v={now} ref_={ref} onExplain={() => setExplain(!explain)} />
        <ScoreCard title="Best from what you own" sub={fromWs[0] ? "Sent from Home or the Workshop" : "Ready tonight, from your characters and vault"} v={views[0]} base={now} busy={busy[0]} ref_={ref} onExplain={() => setExplain(!explain)}
          note={!busy[0] && !views[0] ? (req.exotic ? `You don't own ${req.exotic} yet. Best possible shows it and where to get it.` : "Nothing you own fits these picks.") : Object.keys(req).length > 0 && bestView && views[0] ? lockCost(views[0], bestView, ref) : undefined}
          action={<Button size="sm" disabled={busy[0] || !views[0]?.armor} onClick={() => setEquipping(0)}>Equip in game</Button>} />
        <ScoreCard title="Best possible" sub={fromWs[1] ? "Sent from the Workshop" : "Anything in the game, fully masterworked"} v={views[1]} base={now} busy={busy[1]} ref_={ref} onExplain={() => setExplain(!explain)}
          note={views[1] && !busy[1] ? (needsFarm(views[1]) ? (beats > 0 ? `Beats your best by ${beats}%. Farm list below.` : "Needs farming (list below). Your current best is still stronger overall.") : beats > 0 ? `Your own gear, perfected: +${beats}% over your best today.` : "Nothing in the game beats your best for this.") : undefined}
          action={<div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy[1] || !views[1]?.armor || needsFarm(views[1])} onClick={() => setEquipping(1)}>{needsFarm(views[1]) ? "Farm it first" : "Equip in game"}</Button>
            {alts.length > 1 && <Button size="sm" variant="ghost" disabled={busy[1]} onClick={() => { const i = (altIdx + 1) % alts.length; setAltIdx(i); setSpecs(s => { const n = [...s]; n[1] = alts[i]; return n; }); }}>Next ({altIdx + 1} of {alts.length})</Button>}
          </div>} />
      </section>

      {views[0] && !busy[0] && <Explore v={views[0]} ctx={ctx} goal={goal} settings={settings} rate={x => (ref ? Math.round((100 * x.score) / ref.score) : 0)} onUse={use} />}

      {explain && <RatingHelp onClose={() => setExplain(false)} best={bestView} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-dim">
          <input type="checkbox" checked={showWhere} onChange={e => setShowWhere(e.target.checked)} /> Show where each stat comes from
        </label>
        <MwLegend />
      </div>
      <div className="md:hidden">
        <Segmented label="Compare Now with" value={String(focus) as "0" | "1"} onChange={v => setFocus(Number(v) as Col)}
          options={[{ value: "0", label: "Now vs Best you own" }, { value: "1", label: "Now vs Best possible" }]} />
      </div>
      <Card className="p-0">
        <Table now={now} views={views} ctx={ctx} edit={edit} pinned={pinned} setPinned={setPinned} search={search} busy={busy} focus={focus} showWhere={showWhere} settings={settings} />
      </Card>

      <section className="grid gap-3 md:grid-cols-2">
        {([0, 1] as Col[]).map(c => views[c] && (
          <Card key={c} className="space-y-3">
            <h3 className="text-lg">{c === 0 ? "Best from what you own" : "Best possible"}</h3>
            <LoadoutGrid {...gridFromView(views[c]!)} size={44} />
            {c === 1 && <Farm v={views[c]!} />}
            {now && <DoThis steps={[...stepsFrom(now, views[c]!, ctx), ...modSteps(views[c]!, ctx)]} />}
            <HowToPlay v={views[c]!} />
            {ref && <PointsPanel v={views[c]!} base={now} refScore={ref.score} />}
            <h4 className="font-display text-base">How it works</h4>
            <HowItWorks v={views[c]!} />
            <Stronger v={views[c]!} full={full[c]} ctx={ctx} />
          </Card>
        ))}
      </section>
      {now && now.loops.unfed.length > 0 && (
        <Card className="space-y-2">
          <h3 className="text-lg">In what you wear now</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-dim">
            {now.loops.unfed.map(u => {
              const gives = Object.entries(fragmentStatText(u.name)).length ? ` It still gives ${Object.entries(fragmentStatText(u.name)).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`).join(", ")}, which can be worth keeping.` : "";
              return <li key={u.name + u.token}><b className="text-ink">{u.name}</b>'s effect does nothing right now: it needs {word(u.token)}, and nothing in your build makes that.{gives}</li>;
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

type Ref = { score: number; loop: number; stat: number } | null;

// What "Best possible" needs that you don't have, and where it drops.
function Farm({ v }: { v: BuildView }) {
  const need = gearOf(v).filter(isStandIn);
  if (!need.length) return <p className="text-sm text-good">Everything here is already yours.</p>;
  return (
    <div className="space-y-2 rounded-xl border border-exotic/40 bg-exotic/10 p-3" data-testid="farm">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-exotic">To farm</div>
      {need.map(i => { const src = standInSource(i.id); return (
        <div key={i.id} className="flex items-center gap-3 text-sm">
          <GearIcon src={iconForItem(i)} size={36} exotic={i.exotic} title={i.name} />
          <div><div className="font-medium">{src?.acquired ? `Pull ${i.name} from Collections` : `Get ${farmName(i, v)}`}</div><div className="text-xs text-ink-dim">{src?.source || "Not in your collection yet"}</div></div>
        </div>
      ); })}
      {need.some(i => i.kind === "armor") && <p className="text-xs text-ink-dim">Armor you don't own is rated with the stats of your best exotic in that slot.</p>}
    </div>
  );
}
const pct = (x: number, of: number) => (of > 0 ? Math.max(0, Math.min(100, Math.round((100 * x) / of))) : 0);
export const rating = (v: BuildView, r: Ref) => (r ? pct(v.score, r.score) : 0);

// What the Build around picks cost, compared with Steeped's best when nothing is locked.
function lockCost(v: BuildView, best: BuildView, r: Ref): string | undefined {
  const lost = 100 - rating(v, r);
  if (lost <= 0) return undefined;
  const diffs: string[] = [];
  const a = v.spec, b = best.spec;
  if (a.subclass !== b.subclass) diffs.push(`${a.subclass} instead of ${b.subclass}`);
  if (a.exotic !== b.exotic) diffs.push(`${a.exotic} instead of ${b.exotic}`);
  for (const [k, label] of [["super", "super"], ["grenade", "grenade"], ["melee", "melee"], ["classAbility", "class ability"]] as const)
    if (a.subclass === b.subclass && a[k] !== b[k]) diffs.push(`${a[k]} as ${label}`);
  const asp = a.aspects.filter(x => !b.aspects.includes(x));
  if (asp.length) diffs.push(`${asp.join(" and ")} as aspect${asp.length > 1 ? "s" : ""}`);
  if (a.artifact && a.artifact !== b.artifact) diffs.push(`${a.artifact} as artifact`);
  return `Your Build around picks cost ${lost} point${lost === 1 ? "" : "s"}${diffs.length ? `: ${diffs.join(", ")}` : ""}. Steeped's best with nothing locked scores 100.`;
}

function RatingHelp({ onClose, best }: { onClose: () => void; best: BuildView | null }) {
  return (
    <Card className="space-y-2 text-sm" data-testid="rating-help">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg">What the rating means</h3>
        <Button size="sm" variant="quiet" onClick={onClose}>Close</Button>
      </div>
      <p><b>100 is the strongest build Steeped can make from the gear you own</b>, for the goal you picked{best ? <> (right now: {best.spec.subclass} + {best.spec.exotic})</> : null}. Every other build is rated against it, so 90 means it gets 90% of the way there. It is not a community tier list: it only knows your inventory.</p>
      <p><b>Synergy</b> is how well the pieces feed each other: abilities refilling abilities, combos like Glacier + Shatterdive turning frozen enemies into kills, artifact perks that actually trigger. Pieces that do nothing in the build earn nothing.</p>
      <p><b>Stats</b> is how well your stats fit the build. Cooldowns are nearly maxed at 70, so 70 to 100 counts half, and points past 100 count for the damage bonus they add.</p>
      <p className="text-ink-dim">Both sub-ratings are against the best shown for that part, so a build can have 100 Synergy and 92 Stats. Change the goal and the 100 changes with it. Get a new exotic or weapon and your 100 can go up.</p>
    </Card>
  );
}

function ScoreCard({ title, sub, v, base, busy, action, ref_, onExplain, note }: { title: string; sub: string; v: BuildView | null; base?: BuildView | null; busy?: boolean; action?: ReactNode; ref_: Ref; onExplain: () => void; note?: string }) {
  const r = v ? rating(v, ref_) : 0;
  return (
    <Card className={cn("space-y-2", title !== "Now" && "border-accent/40")} data-testid={`card-${title}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-display text-xl">{title}</div>
          <div className="text-xs text-ink-dim">{sub}</div>
        </div>
        {busy ? <Spinner label="Thinking" /> : v && (
          <div className="text-right">
            <div className="font-display leading-none"><span className="text-3xl" data-testid={`score-${title}`}>{r}</span><span className="text-sm text-ink-dim"> / 100</span></div>
            <button type="button" onClick={onExplain} className="text-xs text-ink-dim underline decoration-dotted underline-offset-2 hover:text-ink">rating {base && <Delta v={r - rating(base, ref_)} />} <span aria-hidden>ⓘ</span></button>
            <div className="text-[11px] text-ink-dim" data-testid={`parts-${title}`}>Synergy {pct(v.loopScore, ref_?.loop ?? 0)} · Stats {pct(v.statScore, ref_?.stat ?? 0)}</div>
          </div>
        )}
      </div>
      {!v && !busy && note && <div className="text-sm text-accent-hi">{note}</div>}
      {v && (
        <>
          {!busy && r < 100 && !note && <div className="text-xs text-ink-dim">{100 - r} points from the best build your gear can make.</div>}
          {!busy && r === 100 && !note && <div className="text-xs text-good">The best build Steeped found with your gear.</div>}
          {!busy && note && <div className="text-xs text-accent-hi">{note}</div>}
          <div className="text-sm"><span className="text-ink">{v.spec.subclass}</span> <span className="text-ink-dim">+</span> <span className="text-exotic">{v.spec.exotic || "no exotic"}</span></div>
          {v.spec.goal !== "trials" && <ArtifactLine name={v.artifact?.name} perks={v.spec.artifactPerks} />}
          <LoadoutFigure v={v} compact />
          <div className="flex flex-wrap gap-2">
            <Badge>{statSum(v)} stat points{base ? <Delta className="ml-1" v={statSum(v) - statSum(base)} /> : null}</Badge>
            <Badge tone={count100(v.stats) >= 2 ? "good" : "neutral"}>{count100(v.stats)} stats at 100+</Badge>
            <Badge tone={lowest(v.stats) >= 50 ? "neutral" : "warn"}>lowest {lowest(v.stats)}</Badge>
            {v.issues.length > 0 && <Badge tone="warn">{v.issues.length} to fix</Badge>}
          </div>
          {action}
        </>
      )}
    </Card>
  );
}

function fragmentStatText(name: string): Record<string, number> {
  const d = [...DEFS.values()].find(x => x.name === name && (x.plugCat.includes("fragments") || x.plugCat.includes("trinkets")));
  const N: Record<number, string> = { 392767087: "Health", 4244567218: "Melee", 1735777505: "Grenade", 144602215: "Super", 1943323491: "Class", 2996146975: "Weapons" };
  const out: Record<string, number> = {};
  for (const [h, v] of d?.stats ?? []) if (N[h]) out[N[h]] = v;
  return out;
}

const statSum = (v: BuildView) => STAT_ORDER.reduce((t, k) => t + v.stats[k], 0);

function StatBar({ value, base }: { value: number; base?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/8">
        <div className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out", value >= 100 ? "bg-good" : value < 50 ? "bg-warn" : "bg-accent-hi")}
          style={{ width: `${Math.min(100, value / 2)}%` }} />
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/40" title="100" />
      </div>
      <span className="w-8 text-right font-display tabular-nums">{value}</span>
      <span className="w-8 text-right">{base !== undefined ? <Delta v={value - base} /> : null}</span>
    </div>
  );
}

const FocusCtx = createContext<Col>(0);
const Row = ({ label, now: n, cells, same, sticky }: { label: ReactNode; now: ReactNode; cells: ReactNode[]; same?: boolean[]; sticky?: string }) => {
  const focus = useContext(FocusCtx);
  return (
  <tr className="border-t border-line/60 align-top">
    <th scope="row" className="sticky left-0 z-10 w-20 bg-bg/95 px-2 py-2 md:w-28 md:px-3 text-left text-xs font-medium uppercase tracking-wide text-ink-dim backdrop-blur">{label}{sticky}</th>
    <td className="px-3 py-2 text-sm md:min-w-48">{n}</td>
    {cells.map((c, i) => <td key={i} className={cn("px-3 py-2 text-sm md:min-w-56", i !== focus && "max-md:hidden", same && !same[i] && "bg-accent/8")}>{c}</td>)}
  </tr>
  );
};
const Section = ({ title }: { title: string }) => (
  <tr><td colSpan={4} className="bg-panel-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent-hi">{title}</td></tr>
);

function Table({ now, views, ctx, edit, pinned, setPinned, search, busy, focus, showWhere, settings }: {
  now: BuildView | null; views: (BuildView | null)[]; ctx: Ctx; edit: (c: Col, p: Partial<BuildSpec>) => void;
  pinned: string[]; setPinned: (p: string[]) => void; search: (c: Col[], o?: { onlySubclass?: Subclass; onlyExotic?: string }) => void; busy: [boolean, boolean];
  focus: Col; showWhere: boolean; settings: Settings;
}) {
  const kitOf = (sub: Subclass, kind: K["kind"]) => ALL.filter(k => k.kind === kind && k.subs?.includes(sub) && ctx.kit.get(sub)?.has(k.name));
  const exotics = [...new Set(ctx.pieces.filter(p => p.exotic && p.item.cls === ctx.cls).map(p => p.item.name))].filter(n => byName.has(n)).sort();
  const cid = ctx.characterId;

  const kName = (n: string) => n
    ? <span className="inline-flex items-center gap-2" title={byName.get(n)?.says}><GearIcon src={iconForName(n)} size={24} title={n} />{n}</span>
    : <span className="text-ink-dim">None</span>;
  const cols = [0, 1] as Col[];

  const abilityRow = (label: string, key: "super" | "grenade" | "melee" | "classAbility", kind: K["kind"]) => (
    <Row key={key} label={label} now={kName(now?.spec[key] ?? "")}
      same={cols.map(c => views[c]?.spec[key] === now?.spec[key])}
      cells={cols.map(c => {
        const v = views[c]; if (!v) return null;
        return (
          <Pick aria-label={`${label} for build ${c ? "B" : "A"}`} changed={v.spec[key] !== now?.spec[key]} value={v.spec[key]} title={byName.get(v.spec[key])?.says}
            onChange={e => edit(c, { [key]: e.target.value } as Partial<BuildSpec>)}>
            {kitOf(v.spec.subclass, kind).map(k => <option key={k.name} value={k.name}>{k.name}</option>)}
          </Pick>
        );
      })} />
  );

  const weaponLabel = (id: string) => {
    const w = ctx.weapons.find(x => x.item.id === id);
    if (!w) return <span className="text-ink-dim">None</span>;
    const perks = w.ks.filter(k => k.name !== w.item.name && !["Sniper Rifle", "Linear Fusion Rifle", "Fusion Rifle", "Rocket Launcher", "Machine Gun", "Sword", "Grenade Launcher"].includes(k.name)).map(k => k.name);
    return (
      <div className="flex gap-2">
        <GearIcon src={iconForItem(w.item)} size={36} exotic={w.item.exotic} element={w.element} mw={w.item.masterworked} title={w.item.name} />
        <div>
          <div className={cn(w.item.exotic && "text-exotic")}>{w.item.name}</div>
          <div className="text-xs text-ink-dim">{w.element} · Power {w.item.power} · {where(w.item, cid)}{perks.length ? ` · ${perks.join(", ")}` : ""}</div>
        </div>
      </div>
    );
  };
  const weaponRow = (slot: "kinetic" | "energy" | "power", idx: number) => {
    const nowId = now?.spec.weapons[idx] ?? "";
    const options = ctx.weapons.filter(w => w.item.slot === slot && (w.item.power >= ctx.light - 100 || views.some(v => v?.spec.weapons[idx] === w.item.id)))
      .sort((a, b) => a.element.localeCompare(b.element) || b.item.power - a.item.power);
    const isPinned = pinned.includes(nowId);
    return (
      <Row key={slot} label={SLOT_LABEL[slot]}
        now={<div className="space-y-1">{weaponLabel(nowId)}{nowId && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-dim">
            <input type="checkbox" checked={isPinned} onChange={() => setPinned(isPinned ? pinned.filter(p => p !== nowId) : [...pinned, nowId])} />
            Keep this weapon in every build
          </label>)}</div>}
        same={cols.map(c => views[c]?.spec.weapons[idx] === nowId)}
        cells={cols.map(c => {
          const v = views[c]; if (!v) return null;
          const cur = v.spec.weapons[idx];
          return (
            <div className="space-y-1">
              <Pick aria-label={`${SLOT_LABEL[slot]} weapon for build ${c ? "B" : "A"}`} changed={cur !== nowId} value={cur}
                onChange={e => { const w = [...v.spec.weapons]; w[idx] = e.target.value; edit(c, { weapons: w }); }}>
                {[...new Set(options.map(o => o.element))].map(el => (
                  <optgroup key={el} label={el}>
                    {options.filter(o => o.element === el).map(o => <option key={o.item.id} value={o.item.id}>{o.item.name} · {o.item.power}{o.ks.length > 1 ? ` · ${o.ks.filter(k => k.name !== o.item.name).map(k => k.name).slice(0, 2).join(", ")}` : ""}</option>)}
                  </optgroup>
                ))}
              </Pick>
              {(() => { const w = ctx.weapons.find(x => x.item.id === cur); return w ? (
                <div className="flex items-center gap-2 text-xs text-ink-dim">
                  <GearIcon src={iconForItem(w.item)} size={28} exotic={w.item.exotic} element={w.element} mw={w.item.masterworked} title={w.item.name} />
                  {w.element} · Power {w.item.power} · {where(w.item, cid)}
                </div>) : null; })()}
            </div>
          );
        })} />
    );
  };

  const plans = views.map(v => (v ? modPlan(v) : {}));
  const fullPlans = views.map(v => (v ? fullModPlan(v, ctx) : []));
  const modsOf = (c: Col, slot: Slot) => {
    const pm = fullPlans[c].find(x => x.slot === slot);
    if (!pm) return null;
    const cur = currentSlotMods(pm.piece, ctx);
    return (
      <div className="mt-0.5 text-xs">
        {pm.mods.map(m => <span key={m.name} title={m.why} className={cn("mr-1 inline-block", cur.includes(m.name) ? "text-ink-dim" : "text-accent-hi")}>{m.name}<span className="text-ink-dim/70"> {m.energy}</span>·</span>)}
        <span className="text-ink-dim/70">{pm.used}/{pm.capacity} energy{pm.open ? `, ${pm.open} open` : ""}</span>
      </div>
    );
  };
  const modLine = (stat?: string, was?: { stat: string; size: number } | null, isNow?: boolean) => {
    const L = (k: string) => STAT_LABEL[k as keyof typeof STAT_LABEL];
    if (isNow) return <div className="mt-1 text-xs text-ink-dim">Mod: {was ? `+${was.size} ${L(was.stat)}` : "none"}</div>;
    if (!stat) return null;
    const same = was && was.stat === stat && was.size === 10;
    return <div className={cn("mt-1 text-xs", same ? "text-ink-dim" : "text-accent-hi")}>Mod: +10 {L(stat)}{!same && <span className="text-ink-dim"> (was {was ? `+${was.size} ${L(was.stat)}` : "empty"})</span>}</div>;
  };
  const curMod = (p?: import("../engine/armor").Piece) => { if (!p) return null; for (const k of STAT_ORDER) if (p.mod[k]) return { stat: k, size: p.mod[k] }; return null; };
  const armorRow = (slot: Slot) => {
    const nowPiece = now?.armor?.pieces[slot];
    return (
      <Row key={slot} label={SLOT_LABEL[slot]}
        now={nowPiece ? <div><ArmorLabel p={nowPiece} cid={cid} />{modLine(undefined, curMod(nowPiece), true)}<div className="mt-0.5 text-xs text-ink-dim">{currentSlotMods(nowPiece, ctx).join(" · ") || "No other mods"}</div></div> : <span className="text-ink-dim">None</span>}
        same={cols.map(c => views[c]?.armor?.pieces[slot]?.item.id === nowPiece?.item.id)}
        cells={cols.map(c => {
          const v = views[c]; if (!v) return null;
          const chosen = v.armor?.pieces[slot];
          const opts = ctx.pieces.filter(p => p.slot === slot && p.item.cls === ctx.cls && (p.exotic ? p.item.name === v.spec.exotic : true) && (p.item.power >= ctx.light - 60 || p.item.id === chosen?.item.id))
            .sort((a, b) => Number(b.exotic) - Number(a.exotic) || b.tier - a.tier || b.item.power - a.item.power);
          const locked = v.spec.armorLocks[slot];
          return (
            <div className="space-y-1">
              <Pick aria-label={`${SLOT_LABEL[slot]} armor for build ${c ? "B" : "A"}`} changed={chosen?.item.id !== nowPiece?.item.id} value={locked ?? ""}
                onChange={e => { const l = { ...v.spec.armorLocks }; if (e.target.value) l[slot] = e.target.value; else delete l[slot]; edit(c, { armorLocks: l }); }}>
                <option value="">Best fit: {chosen ? chosen.item.name : "none"}</option>
                {opts.map(p => <option key={p.item.id} value={p.item.id}>{p.item.name} · T{p.tier} {p.archetype} · {where(p.item, cid)}</option>)}
              </Pick>
              {chosen && <ArmorLabel p={chosen} cid={cid} compact />}
              {chosen && modLine(plans[c][slot]?.stat, plans[c][slot]?.was)}
              {chosen && modsOf(c, slot)}
            </div>
          );
        })} />
    );
  };

  return (
    <FocusCtx.Provider value={focus}>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            <th className="sticky left-0 z-10 bg-bg/95 px-3 py-3" />
            <th className="px-3 py-3 font-display text-lg">Now</th>
            {cols.map(c => <th key={c} className={cn("px-3 py-3 font-display text-lg text-accent-hi", c !== focus && "max-md:hidden")}>{c === 0 ? "Best you own" : "Best possible"} {busy[c] && <Spinner />}</th>)}
          </tr>
        </thead>
        <tbody>
          <Section title="Stats" />
          {STAT_ORDER.map(k => (
            <Row key={k} label={STAT_LABEL[k]}
              now={<div><StatBar value={now?.stats[k] ?? 0} />{showWhere && now && <Where b={breakdown(now, settings, true)} k={k} />}</div>}
              cells={cols.map(c => views[c] ? <div data-testid={`stat-${k}-${c}`}><StatBar value={views[c]!.stats[k]} base={now?.stats[k]} />{showWhere && <Where b={breakdown(views[c]!, settings, false)} k={k} />}</div> : null)} />
          ))}
          <Row label="Stat mods" now={<span className="text-ink-dim">As slotted</span>}
            cells={cols.map(c => views[c]?.armor ? <span>{summarizeMods(views[c]!.armor!.mods)}</span> : null)} />

          <Section title="Subclass" />
          <Row label="Subclass" now={now?.spec.subclass} same={cols.map(c => views[c]?.spec.subclass === now?.spec.subclass)}
            cells={cols.map(c => {
              const v = views[c]; if (!v) return null;
              return (
                <Pick aria-label={`Subclass for build ${c ? "B" : "A"}`} changed={v.spec.subclass !== now?.spec.subclass} value={v.spec.subclass} disabled={busy[c]}
                  onChange={e => search([c], { onlySubclass: e.target.value as Subclass })}>
                  {CLASS_SUBS[ctx.cls].filter(s => ctx.kit.has(s)).map(s => <option key={s} value={s}>{s}</option>)}
                </Pick>
              );
            })} />
          {abilityRow("Super", "super", "super")}
          {abilityRow("Grenade", "grenade", "grenade")}
          {abilityRow("Melee", "melee", "melee")}
          {abilityRow("Class ability", "classAbility", "classAbility")}
          {[0, 1].map(i => (
            <Row key={`asp${i}`} label={`Aspect ${i + 1}`} now={kName(now?.spec.aspects[i] ?? "")}
              same={cols.map(c => views[c]?.spec.aspects[i] === now?.spec.aspects[i])}
              cells={cols.map(c => {
                const v = views[c]; if (!v) return null;
                const other = v.spec.aspects[1 - i];
                return (
                  <Pick aria-label={`Aspect ${i + 1} for build ${c ? "B" : "A"}`} changed={v.spec.aspects[i] !== now?.spec.aspects[i]} value={v.spec.aspects[i] ?? ""}
                    onChange={e => { const a = [...v.spec.aspects]; a[i] = e.target.value; edit(c, { aspects: a.filter(Boolean) }); }}>
                    {kitOf(v.spec.subclass, "aspect").filter(k => k.name !== other).map(k => <option key={k.name} value={k.name}>{k.name} ({k.slotsBy?.[v.spec.subclass] ?? k.slots ?? 2} slots)</option>)}
                  </Pick>
                );
              })} />
          ))}
          <Row label="Fragments" now={<FragList names={now?.spec.fragments ?? []} />}
            same={cols.map(c => [...(views[c]?.spec.fragments ?? [])].sort().join() === [...(now?.spec.fragments ?? [])].sort().join())}
            cells={cols.map(c => {
              const v = views[c]; if (!v) return null;
              const slots = fragmentSlots(v.spec.aspects, v.spec.subclass);
              return <FragPicker key={c} v={v} slots={slots} options={kitOf(v.spec.subclass, "fragment")} onChange={f => edit(c, { fragments: f })} />;
            })} />

          <Section title="Exotic and weapons" />
          <Row label="Exotic" now={<span className="text-exotic">{kName(now?.spec.exotic ?? "")}</span>} same={cols.map(c => views[c]?.spec.exotic === now?.spec.exotic)}
            cells={cols.map(c => {
              const v = views[c]; if (!v) return null;
              const dead = v.loops.unfed.some(u => u.name === v.spec.exotic);
              return (
                <div className="space-y-1">
                  <Pick aria-label={`Exotic for build ${c ? "B" : "A"}`} changed={v.spec.exotic !== now?.spec.exotic} value={v.spec.exotic}
                    onChange={e => { const l = { ...v.spec.armorLocks }; for (const s of ARMOR_SLOTS) if (ctx.pieces.find(p => p.item.id === l[s])?.exotic) delete l[s]; edit(c, { exotic: e.target.value, armorLocks: l }); }}>
                    {exotics.map(n => <option key={n} value={n}>{n}</option>)}
                  </Pick>
                  {dead && <div className="text-xs text-warn">Not triggered by this build: {word(v.loops.unfed.find(u => u.name === v.spec.exotic)!.token)}</div>}
                </div>
              );
            })} />
          {weaponRow("kinetic", 0)}
          {weaponRow("energy", 1)}
          {weaponRow("power", 2)}

          <Section title="Artifact" />
          <Row label="Artifact" now={now?.artifact ? <ArtName a={now.artifact} /> : <span className="text-ink-dim">None</span>}
            same={cols.map(c => views[c]?.artifact?.name === now?.artifact?.name)}
            cells={cols.map(c => {
              const v = views[c]; if (!v) return null;
              return (
                <Pick aria-label={`Artifact for build ${c ? "B" : "A"}`} changed={v.artifact?.name !== now?.artifact?.name} value={v.artifact?.name ?? ""}
                  onChange={e => edit(c, refitArtifact(v.spec, ctx, e.target.value))}>
                  {ctx.artifacts.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                </Pick>
              );
            })} />
          <Row label="Perks" now={now ? <PerkList v={now} /> : null}
            same={cols.map(c => [...(views[c]?.spec.artifactPerks ?? [])].sort().join() === [...(now?.spec.artifactPerks ?? [])].sort().join())}
            cells={cols.map(c => {
              const v = views[c]; if (!v) return null;
              return (
                <div className="space-y-1.5">
                  <PerkList v={v} was={now?.spec.artifactPerks} />
                  {v.artifact && <Button size="sm" variant="quiet" onClick={() => edit(c, refitArtifact(v.spec, ctx, v.artifact!.name))}>Re-pick perks for this build</Button>}
                </div>
              );
            })} />

          <Section title="Armor" />
          {ARMOR_SLOTS.map(armorRow)}
        </tbody>
      </table>
    </div>
    </FocusCtx.Provider>
  );
}

function Where({ b, k }: { b: ReturnType<typeof breakdown>; k: keyof ReturnType<typeof breakdown>["total"] }) {
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  return (
    <div className="mt-1 text-[11px] leading-snug text-ink-dim" data-testid="where">
      armor {b.armor[k]} · mods {sign(b.mods[k])} · fragments {sign(b.fragments[k])}{b.other[k] ? ` · other ${sign(b.other[k])}` : ""}
    </div>
  );
}

function summarizeMods(mods: string[]) {
  const c: Record<string, number> = {};
  for (const m of mods) c[m] = (c[m] ?? 0) + 1;
  return Object.entries(c).map(([k, n]) => `${STAT_LABEL[k as keyof typeof STAT_LABEL]}${n > 1 ? ` x${n}` : ""}`).join(", ") || "None";
}

function ArmorLabel({ p, cid, compact }: { p: import("../engine/armor").Piece; cid: string; compact?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <GearIcon src={iconForItem(p.item)} size={compact ? 28 : 36} exotic={p.exotic} mw={p.legacy ? undefined : p.mwLevel >= 5} title={p.item.name} />
      <div className="text-xs text-ink-dim">
        {!compact && <div className={cn("text-sm", p.exotic ? "text-exotic" : "text-ink")}>{p.item.name}</div>}
        T{p.tier} {p.archetype} · {where(p.item, cid)} · Power {p.item.power}
        {!p.legacy && (p.mwLevel >= 5 ? <span className="text-warn"> · ★ masterworked</span> : <span> · not masterworked</span>)}
      </div>
    </div>
  );
}

function FragList({ names }: { names: string[] }) {
  return <div className="flex flex-wrap gap-1">{names.map(n => <span key={n} title={byName.get(n)?.says} className="rounded-full bg-white/8 px-2 py-0.5 text-xs">{n.replace(/^(Whisper|Echo|Ember|Spark|Facet|Thread) of /, "")}</span>)}</div>;
}

function FragPicker({ v, slots, options, onChange }: { v: BuildView; slots: number; options: K[]; onChange: (f: string[]) => void }) {
  const chosen = v.spec.fragments;
  const statCost = (n: string) => {
    const d = [...DEFS.values()].find(x => x.name === n && (x.plugCat.includes("fragments") || x.plugCat.includes("trinkets")));
    const known = [392767087, 4244567218, 1735777505, 144602215, 1943323491, 2996146975];
    return (d?.stats ?? []).filter(([h]) => known.includes(h)).map(([h, val]) => `${val > 0 ? "+" : ""}${val} ${({ 392767087: "Hea", 4244567218: "Mel", 1735777505: "Gre", 144602215: "Sup", 1943323491: "Cla", 2996146975: "Wea" } as Record<number, string>)[h] ?? ""}`).join(" ");
  };
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-ink-dim">{chosen.length} of {slots} slots</div>
      <div className="flex flex-wrap gap-1">
        {options.map(o => {
          const on = chosen.includes(o.name), full = !on && chosen.length >= slots;
          const cost = statCost(o.name);
          return (
            <button key={o.name} title={o.says} disabled={full} aria-pressed={on}
              onClick={() => onChange(on ? chosen.filter(n => n !== o.name) : [...chosen, o.name])}
              className={cn("cursor-pointer rounded-full border px-2 py-0.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                on ? "border-accent-hi bg-accent/30 text-ink" : "border-line text-ink-dim hover:text-ink")}>
              {o.name.replace(/^(Whisper|Echo|Ember|Spark|Facet|Thread) of /, "")}{cost && <span className={cn("ml-1", cost.includes("-") ? "text-bad" : "text-good")}>{cost}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ArtName = ({ a }: { a: { name: string; item: { hash: number } } }) => (
  <span className="inline-flex items-center gap-2"><GearIcon src={DEFS.get(a.item.hash)?.icon ?? ""} size={24} title={a.name} />{a.name}</span>
);

// An artifact's perks: idle ones (nothing in the build sets them off) are flagged, and new ones are marked.
function PerkList({ v, was }: { v: BuildView; was?: string[] }) {
  if (v.spec.goal === "trials") return <span className="text-ink-dim">Off in Trials and Competitive (Bungie turns artifacts off there)</span>;
  if (!v.artifactPerks.length) return <span className="text-ink-dim">No perks picked</span>;
  const idle = new Map(v.loops.unfed.map(u => [u.name, u.token]));
  return (
    <ul className="space-y-1 text-xs">
      {v.artifactPerks.map(p => (
        <li key={p.name} title={p.says} className={cn(idle.has(p.name) && "text-warn")}>
          <span className="inline-flex items-center gap-1.5"><GearIcon src={DEFS.get(p.hash)?.icon ?? ""} size={18} title={p.name} />{p.name}</span>
          {was && !was.includes(p.name) && <span className="ml-1 text-accent-hi">new</span>}
          {idle.has(p.name) && <span className="text-warn"> · idle, needs {word(idle.get(p.name)!)}</span>}
        </li>
      ))}
    </ul>
  );
}

function BuildAround({ ctx, req, setReq, busy, onApply, pinned, setPinned }: { ctx: Ctx; req: Require; setReq: (r: Require) => void; busy: boolean; onApply: (r: Require) => void; pinned: string[]; setPinned: (p: string[]) => void }) {
  const [open, setOpen] = useState(false);
  // Weapons: your best copy of each gun, per slot. Picking one keeps it in both columns.
  const guns = (slot: string) => [...new Map(ctx.inv.items.filter(i => i.kind === "weapon" && i.slot === slot && !isStandIn(i)).sort((a, b) => b.power - a.power).map(i => [i.name, i])).values()].sort((a, b) => Number(b.exotic) - Number(a.exotic) || a.name.localeCompare(b.name));
  const pinIn = (slot: string) => ctx.inv.items.find(i => pinned.includes(i.id) && i.slot === slot);
  const pin = (slot: string, id: string) => setPinned([...pinned.filter(p => ctx.inv.items.find(i => i.id === p)?.slot !== slot), ...(id ? [id] : [])]);
  const subs = CLASS_SUBS[ctx.cls].filter(s => ctx.kit.has(s));
  const inKit = (k: K) => (req.subclass ? [req.subclass] : subs).some(s => k.subs?.includes(s) && ctx.kit.get(s)?.has(k.name));
  const opts = (kind: K["kind"]) => [...new Map(ALL.filter(k => k.kind === kind && inKit(k)).map(k => [k.name, k])).values()];
  const exotics = [...new Set(ctx.pieces.filter(p => p.exotic && p.item.cls === ctx.cls).map(p => p.item.name))].filter(n => byName.has(n)).sort();
  const unowned = new Set(ctx.pieces.filter(p => p.exotic && isStandIn(p.item)).map(p => p.item.name));
  const picked = [req.subclass, req.super, req.grenade, req.melee, req.classAbility, ...(req.aspects ?? []), ...(req.fragments ?? []), req.exotic, req.artifact, ...(req.artifactPerks ?? [])].filter(Boolean) as string[];
  const perkNames = [...new Set(ctx.artifacts.filter(a => !req.artifact || a.name === req.artifact).flatMap(a => a.sockets.flatMap(s => s.options.map(o => o.name))))].sort();
  const set = (patch: Partial<Require>) => { const r = { ...req, ...patch }; for (const k of Object.keys(r) as (keyof Require)[]) { const v = r[k]; if (!v || (Array.isArray(v) && !v.length)) delete r[k]; } setReq(r); };
  const sel = (label: string, value: string | undefined, list: string[], on: (v: string) => void, tag?: (n: string) => string) => (
    <label className="space-y-1 text-xs text-ink-dim">
      <span>{label}</span>
      <Pick aria-label={`Build around ${label}`} value={value ?? ""} onChange={e => on(e.target.value)}>
        <option value="">Any</option>
        {list.map(n => <option key={n} value={n}>{n}{tag?.(n) ?? ""}</option>)}
      </Pick>
    </label>
  );
  const gunSel = (label: string, slot: string) => (
    <label className="space-y-1 text-xs text-ink-dim">
      <span>{label}</span>
      <Pick aria-label={`Build around ${label}`} value={pinIn(slot)?.id ?? ""} onChange={e => pin(slot, e.target.value)}>
        <option value="">Any</option>
        {guns(slot).map(i => <option key={i.id} value={i.id}>{i.name}{i.exotic ? " (exotic)" : ""}</option>)}
      </Pick>
    </label>
  );
  const pinnedNames = pinned.map(id => ctx.inv.items.find(i => i.id === id)?.name).filter(Boolean) as string[];
  const asp = req.aspects ?? [];
  return (
    <Card className="space-y-4 p-5" data-testid="build-around">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-semibold">Build it your way</h3>
          <p className="text-sm text-ink-dim">{picked.length || pinnedNames.length ? <>Both builds use: <span className="text-ink">{[...picked, ...pinnedNames].join(", ")}</span></> : "Everything on Any: Steeped picks the strongest of each."}</p>
        </div>
        {(picked.length > 0 || pinned.length > 0) && <Button size="sm" variant="quiet" onClick={() => { setReq({}); setPinned([]); onApply({}); }}>Reset to Any</Button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sel("Subclass", req.subclass, subs, v => set({ subclass: v as Subclass }))}
        {sel("Exotic armor", req.exotic, exotics, v => set({ exotic: v }), n => (unowned.has(n) ? " (farm)" : ""))}
        {sel("Aspect", asp[0], opts("aspect").map(k => k.name), v => set({ aspects: [v, asp[1]].filter(Boolean) as string[] }))}
        {sel("Second aspect", asp[1], opts("aspect").map(k => k.name).filter(n => n !== asp[0]), v => set({ aspects: [asp[0], v].filter(Boolean) as string[] }))}
        {sel("Super", req.super, opts("super").map(k => k.name), v => set({ super: v }))}
        {sel("Grenade", req.grenade, opts("grenade").map(k => k.name), v => set({ grenade: v }))}
        {sel("Melee", req.melee, opts("melee").map(k => k.name), v => set({ melee: v }))}
        {sel("Class ability", req.classAbility, opts("classAbility").map(k => k.name), v => set({ classAbility: v }))}
        {gunSel("Kinetic weapon", "kinetic")}
        {gunSel("Energy weapon", "energy")}
        {gunSel("Heavy weapon", "power")}
        {sel("Artifact", req.artifact, ctx.artifacts.map(a => a.name), v => set({ artifact: v, artifactPerks: (req.artifactPerks ?? []).filter(p => !v || ctx.artifacts.find(a => a.name === v)?.sockets.some(s => s.options.some(o => o.name === p))) }))}
      </div>
      {open && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sel("Artifact perk", req.artifactPerks?.[0], perkNames, v => set({ artifactPerks: [v, req.artifactPerks?.[1]].filter(Boolean) as string[] }))}
          {sel("Second perk", req.artifactPerks?.[1], perkNames.filter(n => n !== req.artifactPerks?.[0]), v => set({ artifactPerks: [req.artifactPerks?.[0], v].filter(Boolean) as string[] }))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={() => onApply(req)}>{busy ? "Building…" : "Build it"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Fewer choices" : "Pick artifact perks"}</Button>
      </div>
    </Card>
  );
}

function DoThis({ steps }: { steps: { what: string; detail?: string }[] }) {
  if (!steps.length) return <p className="text-sm text-good">Nothing to change: this is what you're wearing.</p>;
  return (
    <div className="space-y-1.5" data-testid="do-this">
      <h4 className="font-display text-base">Do this in game ({steps.length} changes)</h4>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {steps.map((st, i) => <li key={i}>{st.what}{st.detail && <span className="text-ink-dim"> ({st.detail})</span>}</li>)}
      </ol>
    </div>
  );
}

// The playbook: what to actually do in a fight, built from the signature combos this build has.
// Where the rating comes from, piece by piece, in rating points (the same scale as the 0 to 100 rating).
export function PointsPanel({ v, base, refScore, open }: { v: BuildView; base?: BuildView | null; refScore: number; open?: boolean }) {
  const rows = pointsByPiece(v), was = base ? new Map(pointsByPiece(base).map(p => [p.name, p.points])) : null;
  const rp = (x: number) => (100 * x) / refScore;
  const fmt = (x: number) => { const y = rp(x); return Math.abs(y) < 0.05 ? "0" : `${y > 0 ? "+" : ""}${y.toFixed(1)}`; };
  const groups = ["Weapons", "Exotic", "Artifact", "Subclass", "Stats"] as const;
  return (
    <details className="rounded-md border border-line p-3 text-sm" open={open} data-testid="points">
      <summary className="cursor-pointer font-display text-base">Where the rating comes from</summary>
      <p className="mt-1 text-xs text-ink-dim">Each piece shows how many rating points this build would lose without it. Pieces that only work together (Glacier and Shatterdive) each show the whole pairing, so the numbers overlap and don't add up to the total.{was ? " The right column is the same piece in what you're wearing now." : ""}</p>
      {groups.map(g => {
        const list = rows.filter(r => r.group === g).sort((a, b) => (g === "Stats" ? 0 : b.points - a.points)); // stats stay in the game's order
        if (!list.length) return null;
        const sum = list.reduce((t, r) => t + r.points, 0);
        return (
          <div key={g} className="mt-2">
            <div className="flex justify-between text-xs font-semibold uppercase tracking-wider text-accent-hi"><span>{g}</span>{g === "Stats" && <span>{fmt(sum)} total</span>}</div>
            <table className="w-full text-xs">
              <tbody>
                {list.map(r => (
                  <tr key={r.name} className="border-t border-line/50">
                    <td className="py-1 pr-2"><span className={cn(r.points <= 0.05 && g !== "Stats" && "text-warn")}>{r.name}</span>{r.detail && <span className="text-ink-dim"> · {r.detail}</span>}{r.points <= 0.05 && g !== "Stats" && <span className="text-warn"> · adds nothing here</span>}</td>
                    <td className="w-14 text-right font-semibold">{fmt(r.points)}</td>
                    {was && <td className="w-14 text-right text-ink-dim">{was.has(r.name) ? fmt(was.get(r.name)!) : "new"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="mt-2 text-xs text-ink-dim">Stats are valued the way this build uses them: stats it leans on count more, anything under your minimum costs points, 70 to 100 counts half, and with Most 100s reaching 100 earns a bonus. Raise "Health at least" if you want Health protected.</p>
    </details>
  );
}

// Crucible: mode rules, Bungie's PvP changes for pieces in this build, and how each gun rates for duels.
function PvpNotes({ v }: { v: BuildView }) {
  const names = [v.spec.super, v.spec.grenade, v.spec.melee, v.spec.classAbility, ...v.spec.aspects, ...v.spec.fragments, v.spec.exotic];
  const notes = names.filter(n => PVP_NOTES[n]).map(n => ({ n, t: PVP_NOTES[n] }));
  const guns = v.weapons.filter((w): w is NonNullable<typeof w> => !!w);
  return (
    <div className="space-y-1.5 border-t border-line pt-2 text-xs text-ink-dim" data-testid="pvp-notes">
      <p><b className="text-ink">Mode:</b> {MODE_NOTES[v.spec.goal === "trials" ? "trials" : "crucible"]}</p>
      {notes.map(x => <p key={x.n}><b className="text-ink">{x.n}:</b> {x.t} <span className="text-ink-dim">(Bungie patch notes)</span></p>)}
      {guns.length > 0 && (
        <div>
          <p><b className="text-ink">Duel ratings</b> (this roll's stats from Bungie, weighted by Steeped's view of what wins duels for each weapon type):</p>
          <ul className="mt-0.5 space-y-0.5">
            {guns.map(w => (
              <li key={w.item.id}><span className="text-ink">{w.item.name}</span> ({w.type}): {w.duel !== undefined ? <b className="text-ink">{w.duel.toFixed(1)} / 10</b> : "not rated for this type"}
                {" · "}{(["range", "handling", "stability", "aim", "airborne", "reload"] as const).map(k => `${WSTAT_LABEL[k]} ${w.wstats[k] ?? 0}`).join(", ")}{w.wstats.rpm ? `, ${w.wstats.rpm} RPM` : ""}</li>
            ))}
          </ul>
        </div>
      )}
      <p>Not planned yet: Font mods (they depend on Armor Charge, which Steeped doesn't model). Weapon perks that only work in certain moments (like Opening Shot) are not rated for PvP yet.</p>
    </div>
  );
}

export function HowToPlay({ v }: { v: BuildView }) {
  const idle = v.artifactPerks.filter(p => v.loops.unfed.some(u => u.name === p.name));
  const active = v.artifactPerks.filter(p => !idle.includes(p));
  return (
    <div className="space-y-2 rounded-md border border-line bg-panel-2/40 p-3 text-sm">
      <h4 className="font-display text-base">How to play it</h4>
      {v.loops.combos.length ? (
        <ol className="list-decimal space-y-1.5 pl-5">
          {v.loops.combos.map(c => <li key={c.name}><b>{c.name}.</b> {c.play}</li>)}
        </ol>
      ) : <p className="text-ink-dim">{isPvp(v.spec.goal) ? "In the Crucible, Steeped rates how your abilities kill, lock down or save you, and how your guns duel. The PvE combos don't apply." : "No signature combo in this build yet: its pieces work on their own rather than feeding each other."}</p>}
      {isPvp(v.spec.goal) && <PvpNotes v={v} />}
      {v.artifact && v.spec.goal !== "trials" && (
        <div className="space-y-1 border-t border-line pt-2 text-xs text-ink-dim" data-testid="artifact-play">
          <p><b className="text-ink">Artifact: {v.artifact.name}.</b></p>
          <ul className="space-y-0.5">
            {active.map(p => <li key={p.name}><b className="text-ink">{p.name}:</b> {p.says}</li>)}
          </ul>
          {idle.length > 0 && <p className="text-warn">Doing nothing in this build: {idle.map(p => p.name).join(", ")}. Swap them for perks that fit.</p>}
        </div>
      )}
    </div>
  );
}

export function HowItWorks({ v }: { v: BuildView }) {
  const ab: Record<string, string> = { grenade: "Your grenade", melee: "Your melee", classAbility: "Your dodge", super: "Your super" };
  return (
    <div className="space-y-2 text-sm">
      {v.issues.map(i => <p key={i} className="text-warn">{i}</p>)}
      <ul className="space-y-1.5">
        {v.loops.energy.map(e => (
          <li key={e.kind}><b>{ab[e.kind]}</b> ({e.ability}) comes back faster from <span className="text-accent-hi">{e.refills.join(", ")}</span>.</li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer text-ink-dim">Every connection ({v.loops.links.length})</summary>
        <ul className="mt-2 space-y-1 text-xs text-ink-dim">
          {v.loops.links.map((l, i) => <li key={i}>{l.from} gives {word(l.token)} to <span className="text-ink">{l.to}</span></li>)}
        </ul>
      </details>
      {v.loops.unfed.length > 0 && (
        <ul className="space-y-1 text-xs text-warn">
          {v.loops.unfed.map(u => <li key={u.name + u.token}>{u.name} isn't triggered: it needs {word(u.token)}.</li>)}
        </ul>
      )}
    </div>
  );
}

function Stronger({ v, full, ctx }: { v: BuildView; full: BuildView | null; ctx: Ctx }) {
  const mw = Object.values(v.armor?.pieces ?? {}).filter(p => p.tier >= 3 && p.mwLevel < 5);
  const infuse = v.weapons.filter(w => w && w.item.power < ctx.light - 10);
  const gain = full ? STAT_ORDER.map(k => [k, full.stats[k] - v.stats[k]] as const).filter(([, d]) => d) : [];
  if (!mw.length && !infuse.length) return <p className="text-sm text-good">Nothing to upgrade: every piece is masterworked and at your Power.</p>;
  return (
    <div className="space-y-2 border-t border-line pt-3 text-sm">
      <h4 className="font-display text-base">Make it stronger</h4>
      <ol className="list-decimal space-y-1 pl-5">
        {mw.length > 0 && <li>Masterwork {mw.map(p => p.item.name).join(", ")}.{full && gain.length > 0 && <> With the best masterworked armor: {gain.map(([k, d]) => <span key={k} className="mr-1">{STAT_LABEL[k]} <Delta v={d} /></span>)}</>}</li>}
        {infuse.map(w => <li key={w!.item.id}>Infuse {w!.item.name} (Power {w!.item.power}) up toward {ctx.light}.</li>)}
      </ol>
    </div>
  );
}

// Try other options: pick any piece of your best build and see every alternative you own, ranked in that build.
function Explore({ v, ctx, goal, settings, rate, onUse }: { v: BuildView; ctx: Ctx; goal: Goal; settings: Settings; rate: (v: BuildView) => number; onUse: (sel: SlotId, o: Option, next: BuildSpec) => void }) {
  const [sel, setSel] = useState<SlotId | null>(null);
  const s = v.spec;
  const name = (id: string) => ctx.inv.items.find(i => i.id === id)?.name ?? "Empty";
  const slots: { id: SlotId; label: string; value: string }[] = [
    { id: { kind: "aspect", i: 0 }, label: "Aspect", value: s.aspects[0] ?? "Empty" },
    { id: { kind: "aspect", i: 1 }, label: "Aspect", value: s.aspects[1] ?? "Empty" },
    { id: { kind: "artifact" }, label: "Artifact", value: v.artifact?.name ?? "None" },
    { id: { kind: "super" }, label: "Super", value: s.super },
    { id: { kind: "grenade" }, label: "Grenade", value: s.grenade },
    { id: { kind: "melee" }, label: "Melee", value: s.melee },
    { id: { kind: "classAbility" }, label: "Class ability", value: s.classAbility },
    { id: { kind: "exotic" }, label: "Exotic", value: s.exotic },
    ...(["Kinetic", "Energy", "Heavy"] as const).map((l, i) => ({ id: { kind: "weapon", i } as SlotId, label: l, value: name(s.weapons[i]) })),
    ...s.fragments.map((f, i) => ({ id: { kind: "fragment", i } as SlotId, label: "Fragment", value: f })),
  ];
  // Only gear you own here: this tunes the build you can wear tonight.
  const options = useMemo(() => (sel ? optionsFor(sel, v, ctx).filter(o => !o.key.startsWith("cat:") && !(sel.kind === "exotic" && !ctx.pieces.some(p => p.item.name === o.key && !isStandIn(p.item)))) : []), [sel, v, ctx]);
  const tried = useMemo(() => (sel ? tryOptions(options, v, ctx, goal, settings) : []), [options, v, ctx, goal, settings, sel]);
  const [all, setAll] = useState(false);
  const shown = all ? tried : tried.slice(0, 6);
  return (
    <Card className="space-y-4 p-5" data-testid="explore">
      <div>
        <h3 className="font-display text-xl font-semibold">Try other options</h3>
        <p className="text-sm text-ink-dim">Tap any piece of your best build to see everything you own for it, ranked in this build. "Use this" swaps it in and locks it.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map(x => (
          <button key={slotKey(x.id)} type="button" data-testid={`explore-${slotKey(x.id)}`} onClick={() => { setSel(sel && slotKey(sel) === slotKey(x.id) ? null : x.id); setAll(false); }}
            className={cn("rounded-xl border px-3 py-1.5 text-left text-sm", sel && slotKey(sel) === slotKey(x.id) ? "border-accent-hi bg-accent/25" : "border-line bg-panel-2 hover:border-accent/60")}>
            <div className="text-[11px] uppercase tracking-wide text-ink-dim">{x.label}</div>
            <div className="font-medium">{x.value}</div>
          </button>
        ))}
      </div>
      {sel && (
        tried.length <= 1 ? <p className="text-sm text-ink-dim">Nothing else you own fits this slot.</p> : (
          <>
            <ul className="space-y-2" data-testid="explore-options">
              {shown.map(t => <OptionRow key={t.o.key} t={t} base={v} r={rate} onPick={() => onUse(sel, t.o, t.v.spec)} />)}
            </ul>
            {tried.length > shown.length && <Button size="sm" variant="ghost" onClick={() => setAll(true)}>Show all {tried.length}</Button>}
          </>
        )
      )}
    </Card>
  );
}
