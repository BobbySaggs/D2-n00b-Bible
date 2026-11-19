import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ARMOR_SLOTS, STAT_LABEL, STAT_ORDER, type Slot } from "../bungie/config";
import { DEFS } from "../bungie/defs";
import type { Inventory, Item } from "../model/inventory";
import { HUNTER, SUBCLASSES, byName, type K, type Subclass } from "../knowledge/hunter";
import { breakdown, currentSlotMods, evaluate, refitArtifact, evaluateNow, fragmentSlots, fullModPlan, makeCtx, modPlan, modSteps, stepsFrom, tuneCurrent, type BuildSpec, type BuildView, type Ctx, type Settings } from "../engine/evaluate";
import type { Require } from "../engine/builds";
import { equipPlan } from "../engine/equip";
import { EquipDialog } from "./EquipDialog";
import { count100, lowest } from "../engine/solve";
import type { Goal } from "../engine/loops";
import { runSearch } from "../workers/search";
import { Badge, Button, Card, cn } from "../ui/kit";
import { Delta, Pick, Segmented, Spinner } from "../ui/bits";
import { GearIcon, LoadoutFigure, MwLegend, iconForItem, iconForName } from "../ui/gear";

const GOALS: { value: Goal; label: string }[] = [
  { value: "whole", label: "Whole activity" },
  { value: "abilities", label: "Ability spam" },
  { value: "bossDps", label: "Raid boss" },
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
const word = (t: string) => t.split(" or ").map(x => WORDS[x] ?? x).join(" or ");

const where = (i: Item, cid: string) =>
  i.owner === cid && i.equipped ? "Worn" : i.owner === cid ? "On character" : i.owner === "vault" ? "Vault" : "Other character";

type Col = 0 | 1;

export function Builder({ inv, onRefresh }: { inv: Inventory; onRefresh?: () => void }) {
  const hunter = inv.characters.find(c => c.cls === "Hunter");
  const ctx = useMemo<Ctx | null>(() => (hunter ? makeCtx(inv, h => DEFS.get(h), [...DEFS.values()], hunter.id) : null), [inv, hunter]);
  const [goal, setGoal] = useState<Goal>("whole");
  const [settings, setSettings] = useState<Settings>({ healthFloor: 50, mw: "asIs", style: "peaks" });
  const [pinned, setPinned] = useState<string[]>([]);
  const [specs, setSpecs] = useState<(BuildSpec | null)[]>([null, null]);
  const [busy, setBusy] = useState<[boolean, boolean]>([false, false]);
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState<Col>(0);
  const [showWhere, setShowWhere] = useState(false);
  const [req, setReq] = useState<Require>({});
  const [equipping, setEquipping] = useState<Col | null>(null);
  const [alts, setAlts] = useState<BuildSpec[]>([]); // Steeped's top builds for this goal, for Build B
  const [altIdx, setAltIdx] = useState(0); // on phones: compare Now with one build at a time
  const [best, setBest] = useState<BuildSpec | null>(null); // Steeped's best for this goal with nothing locked: the 100 mark
  const [explain, setExplain] = useState(false);

  const search = async (cols: Col[], opts: { onlySubclass?: Subclass; onlyExotic?: string; require?: Require } = {}) => {
    if (!ctx) return;
    setBusy(b => [cols.includes(0) || b[0], cols.includes(1) || b[1]]);
    setErr("");
    try {
      const require = opts.require ?? (Object.keys(req).length ? req : undefined);
      const found = await runSearch({ characterId: ctx.characterId, goal, top: cols.length === 2 ? 6 : 1, pinnedWeapons: pinned, ...opts, require }, inv, ctx.defs);
      if (!found.length) setErr("No build fits everything you asked for. Try removing one of the Build around picks.");
      // The rating's yardstick is always the best build with nothing locked, so Build around can't move the goalposts.
      if (!require && !opts.onlySubclass && !opts.onlyExotic && found[0]) setBest(found[0]);
      else if (cols.length === 2 || !best) {
        const free = await runSearch({ characterId: ctx.characterId, goal, top: 1, pinnedWeapons: [] }, inv, ctx.defs);
        if (free[0]) setBest(free[0]);
      }
      setSpecs(s => {
        const next = [...s];
        if (cols.length === 2) { next[0] = tuneCurrent(ctx, goal) ?? found[1] ?? null; next[1] = found[0] ?? null; setAlts(found); setAltIdx(0); }
        else next[cols[0]] = found[0] ?? next[cols[0]];
        return next;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(b => [cols.includes(0) ? false : b[0], cols.includes(1) ? false : b[1]]);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { search([0, 1]); }, [ctx, goal, pinned.join(",")]);

  const now = useMemo(() => (ctx ? evaluateNow(ctx, goal, settings) : null), [ctx, goal, settings]);
  const views = useMemo(() => specs.map(s => (s && ctx ? evaluate({ ...s, goal }, ctx, settings) : null)), [specs, ctx, goal, settings]);
  const bestView = useMemo(() => (best && ctx ? evaluate({ ...best, goal }, ctx, settings) : null), [best, ctx, goal, settings]);
  // 100 = the strongest build Steeped can make from your gear for this goal (or whichever shown build beats it).
  const ref = useMemo(() => {
    const all = [bestView, now, ...views].filter((x): x is BuildView => !!x);
    if (!all.length) return null;
    return { score: Math.max(...all.map(x => x.score)), loop: Math.max(...all.map(x => x.loopScore)), stat: Math.max(...all.map(x => x.statScore)) };
  }, [bestView, now, views]);
  const full = useMemo(() => specs.map(s => (s && ctx && settings.mw === "asIs" ? evaluate({ ...s, goal }, ctx, { ...settings, mw: "full" }) : null)), [specs, ctx, goal, settings]);

  if (!hunter || !ctx) return <Card>The builder knows Hunters first. Titan and Warlock are next.</Card>;
  const edit = (c: Col, patch: Partial<BuildSpec>) => setSpecs(s => { const n = [...s]; if (n[c]) n[c] = { ...n[c]!, ...patch }; return n; });

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="What are you building for?" value={goal} options={GOALS} onChange={setGoal} />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Segmented label="Stat style" value={settings.style} onChange={style => setSettings(s => ({ ...s, style }))}
            options={[{ value: "peaks", label: "Most 100s" }, { value: "even", label: "Even spread" }]} />
          <Segmented label="Masterwork" value={settings.mw} onChange={mw => setSettings(s => ({ ...s, mw }))}
            options={[{ value: "asIs", label: "Gear as is" }, { value: "full", label: "If masterworked" }]} />
          <label className="flex items-center gap-2 text-ink-dim">
            Health at least
            <Pick className="w-20" value={settings.healthFloor} onChange={e => setSettings(s => ({ ...s, healthFloor: Number(e.target.value) }))}>
              {[40, 50, 60, 70, 80, 90, 100].map(v => <option key={v} value={v}>{v}</option>)}
            </Pick>
          </label>
        </div>
      </section>
      {err && <Card className="border-bad/40 text-bad">{err}</Card>}
      {equipping !== null && views[equipping] && (
        <EquipDialog title={`Build ${equipping ? "B" : "A"}: ${views[equipping]!.spec.subclass} + ${views[equipping]!.spec.exotic}`}
          steps={equipPlan(views[equipping]!, ctx)} who={{ membershipType: inv.account.membershipType, characterId: ctx.characterId }}
          onClose={() => setEquipping(null)} onDone={() => onRefresh?.()} />
      )}

      <BuildAround ctx={ctx} req={req} setReq={setReq} busy={busy[1]} onApply={r => search([1], { require: r })} />

      <section className="grid gap-3 md:grid-cols-3">
        <ScoreCard title="Now" sub="What you're wearing" v={now} ref_={ref} onExplain={() => setExplain(!explain)} />
        {([0, 1] as Col[]).map(c => (
          <ScoreCard key={c} title={c === 0 ? "Build A" : "Build B"} sub={c === 0 ? "Your build, tuned: same subclass, exotic and weapons" : altIdx === 0 ? "Steeped's best for this goal" : `Steeped's #${altIdx + 1} for this goal`} v={views[c]} base={now} busy={busy[c]} ref_={ref} onExplain={() => setExplain(!explain)}
            note={c === 1 && Object.keys(req).length > 0 && bestView && views[1] ? lockCost(views[1], bestView, ref) : undefined}
            action={c === 0
              ? <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!views[0]?.armor} onClick={() => setEquipping(0)}>Equip in game</Button>
                  <Button size="sm" variant="ghost" onClick={() => setSpecs(s => { const n = [...s]; n[0] = tuneCurrent(ctx, goal); return n; })}>Reset to my build, tuned</Button>
                </div>
              : <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy[c] || !views[c]?.armor} onClick={() => setEquipping(1)}>Equip in game</Button>
                  {alts.length > 1 && <Button size="sm" disabled={busy[c]} onClick={() => { const i = (altIdx + 1) % alts.length; setAltIdx(i); setSpecs(s => { const n = [...s]; n[1] = alts[i]; return n; }); }}>Next alternative ({altIdx + 1} of {alts.length})</Button>}
                  <Button size="sm" variant="ghost" disabled={busy[c]} onClick={() => search([c], { onlySubclass: views[c]?.spec.subclass, onlyExotic: views[c]?.spec.exotic })}>Re-tune around this</Button>
                </div>} />
        ))}
      </section>

      {explain && <RatingHelp onClose={() => setExplain(false)} best={bestView} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-dim">
          <input type="checkbox" checked={showWhere} onChange={e => setShowWhere(e.target.checked)} /> Show where each stat comes from
        </label>
        <MwLegend />
      </div>
      <div className="md:hidden">
        <Segmented label="Compare Now with" value={String(focus) as "0" | "1"} onChange={v => setFocus(Number(v) as Col)}
          options={[{ value: "0", label: "Now vs Build A" }, { value: "1", label: "Now vs Build B" }]} />
      </div>
      <Card className="p-0">
        <Table now={now} views={views} ctx={ctx} edit={edit} pinned={pinned} setPinned={setPinned} search={search} busy={busy} focus={focus} showWhere={showWhere} settings={settings} />
      </Card>

      <section className="grid gap-3 md:grid-cols-2">
        {([0, 1] as Col[]).map(c => views[c] && (
          <Card key={c} className="space-y-3">
            <h3 className="text-lg">{c === 0 ? "Build A (your build, tuned)" : "Build B (Steeped's best)"}</h3>
            {now && <DoThis steps={[...stepsFrom(now, views[c]!, ctx), ...modSteps(views[c]!, ctx)]} />}
            <HowToPlay v={views[c]!} />
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
      {v && (
        <>
          {!busy && r < 100 && !note && <div className="text-xs text-ink-dim">{100 - r} points from the best build your gear can make.</div>}
          {!busy && r === 100 && <div className="text-xs text-good">The best build Steeped found with your gear.</div>}
          {!busy && note && <div className="text-xs text-warn">{note}</div>}
          <div className="text-sm"><span className="text-ink">{v.spec.subclass}</span> <span className="text-ink-dim">+</span> <span className="text-exotic">{v.spec.exotic || "no exotic"}</span></div>
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
  const kitOf = (sub: Subclass, kind: K["kind"]) => HUNTER.filter(k => k.kind === kind && k.subs?.includes(sub) && ctx.kit.get(sub)?.has(k.name));
  const exotics = [...new Set(ctx.pieces.filter(p => p.exotic && p.item.cls === "Hunter").map(p => p.item.name))].filter(n => byName.has(n)).sort();
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
          const opts = ctx.pieces.filter(p => p.slot === slot && p.item.cls === "Hunter" && (p.exotic ? p.item.name === v.spec.exotic : true) && (p.item.power >= ctx.light - 60 || p.item.id === chosen?.item.id))
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
            {cols.map(c => <th key={c} className={cn("px-3 py-3 font-display text-lg text-accent-hi", c !== focus && "max-md:hidden")}>{c === 0 ? "Build A" : "Build B"} {busy[c] && <Spinner />}</th>)}
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
                  {SUBCLASSES.filter(s => ctx.kit.has(s)).map(s => <option key={s} value={s}>{s}</option>)}
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
                    {kitOf(v.spec.subclass, "aspect").filter(k => k.name !== other).map(k => <option key={k.name} value={k.name}>{k.name} ({k.slots ?? 2} slots)</option>)}
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

function BuildAround({ ctx, req, setReq, busy, onApply }: { ctx: Ctx; req: Require; setReq: (r: Require) => void; busy: boolean; onApply: (r: Require) => void }) {
  const [open, setOpen] = useState(false);
  const subs = SUBCLASSES.filter(s => ctx.kit.has(s));
  const inKit = (k: K) => (req.subclass ? [req.subclass] : subs).some(s => k.subs?.includes(s) && ctx.kit.get(s)?.has(k.name));
  const opts = (kind: K["kind"]) => [...new Map(HUNTER.filter(k => k.kind === kind && inKit(k)).map(k => [k.name, k])).values()];
  const exotics = [...new Set(ctx.pieces.filter(p => p.exotic && p.item.cls === "Hunter").map(p => p.item.name))].filter(n => byName.has(n)).sort();
  const picked = [req.subclass, req.super, req.grenade, req.melee, req.classAbility, ...(req.aspects ?? []), ...(req.fragments ?? []), req.exotic, req.artifact, ...(req.artifactPerks ?? [])].filter(Boolean) as string[];
  const perkNames = [...new Set(ctx.artifacts.filter(a => !req.artifact || a.name === req.artifact).flatMap(a => a.sockets.flatMap(s => s.options.map(o => o.name))))].sort();
  const set = (patch: Partial<Require>) => { const r = { ...req, ...patch }; for (const k of Object.keys(r) as (keyof Require)[]) { const v = r[k]; if (!v || (Array.isArray(v) && !v.length)) delete r[k]; } setReq(r); };
  const sel = (label: string, value: string | undefined, list: string[], on: (v: string) => void) => (
    <label className="space-y-1 text-xs text-ink-dim">
      <span>{label}</span>
      <Pick aria-label={`Build around ${label}`} value={value ?? ""} onChange={e => on(e.target.value)}>
        <option value="">Any</option>
        {list.map(n => <option key={n} value={n}>{n}</option>)}
      </Pick>
    </label>
  );
  const asp = req.aspects ?? [];
  return (
    <Card className="space-y-3" data-testid="build-around">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg">Build around what you want</h3>
          <p className="text-sm text-ink-dim">{picked.length ? <>Build B must use: <span className="text-ink">{picked.join(", ")}</span></> : "Pick anything you insist on (an aspect, a grenade, an exotic) and Build B finds the best build that keeps it."}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? "Hide" : picked.length ? "Change" : "Choose"}</Button>
          {picked.length > 0 && <Button size="sm" variant="quiet" onClick={() => { setReq({}); onApply({}); }}>Clear</Button>}
        </div>
      </div>
      {open && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sel("Subclass", req.subclass, subs, v => set({ subclass: v as Subclass }))}
            {sel("Super", req.super, opts("super").map(k => k.name), v => set({ super: v }))}
            {sel("Grenade", req.grenade, opts("grenade").map(k => k.name), v => set({ grenade: v }))}
            {sel("Melee", req.melee, opts("melee").map(k => k.name), v => set({ melee: v }))}
            {sel("Class ability", req.classAbility, opts("classAbility").map(k => k.name), v => set({ classAbility: v }))}
            {sel("Aspect", asp[0], opts("aspect").map(k => k.name), v => set({ aspects: [v, asp[1]].filter(Boolean) as string[] }))}
            {sel("Second aspect", asp[1], opts("aspect").map(k => k.name).filter(n => n !== asp[0]), v => set({ aspects: [asp[0], v].filter(Boolean) as string[] }))}
            {sel("Exotic", req.exotic, exotics, v => set({ exotic: v }))}
            {sel("Artifact", req.artifact, ctx.artifacts.map(a => a.name), v => set({ artifact: v, artifactPerks: (req.artifactPerks ?? []).filter(p => !v || ctx.artifacts.find(a => a.name === v)?.sockets.some(s => s.options.some(o => o.name === p))) }))}
            {sel("Artifact perk", req.artifactPerks?.[0], perkNames, v => set({ artifactPerks: [v, req.artifactPerks?.[1]].filter(Boolean) as string[] }))}
            {sel("Second perk", req.artifactPerks?.[1], perkNames.filter(n => n !== req.artifactPerks?.[0]), v => set({ artifactPerks: [req.artifactPerks?.[0], v].filter(Boolean) as string[] }))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={busy || !picked.length} onClick={() => { onApply(req); setOpen(false); }}>{busy ? "Finding…" : "Find the best build with these"}</Button>
            <span className="text-xs text-ink-dim">Uses the goal you picked above (General PvE, Raid boss...). Build A stays your build, tuned.</span>
          </div>
        </>
      )}
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
function HowToPlay({ v }: { v: BuildView }) {
  const idle = v.artifactPerks.filter(p => v.loops.unfed.some(u => u.name === p.name));
  const active = v.artifactPerks.filter(p => !idle.includes(p));
  return (
    <div className="space-y-2 rounded-md border border-line bg-panel-2/40 p-3 text-sm">
      <h4 className="font-display text-base">How to play it</h4>
      {v.loops.combos.length ? (
        <ol className="list-decimal space-y-1.5 pl-5">
          {v.loops.combos.map(c => <li key={c.name}><b>{c.name}.</b> {c.play}</li>)}
        </ol>
      ) : <p className="text-ink-dim">No signature combo in this build yet: its pieces work on their own rather than feeding each other.</p>}
      {v.artifact && (
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

function HowItWorks({ v }: { v: BuildView }) {
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
