import { useMemo, useState, type ReactNode } from "react";
import type { CatalogEntry } from "../bungie/catalog";
import { DEFS } from "../bungie/defs";
import type { Inventory, Item } from "../model/inventory";
import { evaluate, makeCtx, type BuildSpec, type BuildView, type Settings } from "../engine/evaluate";
import type { Compare, FarmRow, Grade } from "../engine/maxhunter";
import { equipPlan, saveUndo, snapshotWorn } from "../engine/equip";
import { Button, Card, cn } from "../ui/kit";
import { Segmented } from "../ui/bits";
import { useMax } from "../ui/useMax";
import { GearIcon, iconForItem } from "../ui/gear";
import { LoadoutGrid, Moment, gradeClass, gridFromView, gridFromWorn } from "../ui/visual";
import { EquipDialog } from "./EquipDialog";
import { CLARITY_DISCORD, CLARITY_ON, CLARITY_SITE } from "../bungie/clarity";

// Home answers two questions. What's the strongest I can wear right now (and put it on)? What should I farm, and why?
export const gradeTone = (g: Grade) => (g === "Great" ? "good" : g === "Good" ? "neutral" : "warn") as "good" | "neutral" | "warn";
export const buildName = (s: BuildSpec) => `${s.subclass === "Prismatic Hunter" ? "Prismatic" : s.subclass} · ${s.exotic}`;
const SETTINGS: Settings = { targets: {}, mw: "asIs", style: "peaks", tune: true };

// The item a line talks about, so it can show its icon (longest name wins: "Iron Battalion Strides" over "Iron").
export function itemIn(text: string, items: Item[]): Item | undefined {
  let best: Item | undefined;
  for (const i of items) if ((i.kind === "weapon" || i.kind === "armor") && text.includes(i.name) && (!best || i.name.length > best.name.length || (i.name === best.name && i.power > best.power))) best = i;
  return best;
}

const JOBS = [{ value: "Max Hunter", label: "All-round" }, { value: "Boss damage", label: "Boss damage" }];

export function Home({ inv, catalog, onOpen, onGo, onRefresh }: { inv: Inventory; catalog: CatalogEntry[]; onOpen: (spec: BuildSpec) => void; onGo: (screen: "builds" | "journey" | "inventory") => void; onRefresh?: () => void }) {
  const hunter = inv.characters.find(c => c.cls === "Hunter");
  const { m, err } = useMax(inv, catalog);
  const [job, setJob] = useState("Max Hunter");
  const [wearing, setWearing] = useState<BuildView | null>(null);
  const [more, setMore] = useState(false);
  const ctx = useMemo(() => (hunter ? makeCtx(inv, h => DEFS.get(h), [...DEFS.values()], hunter.id) : null), [inv, hunter]);
  const worn = useMemo(() => (hunter ? gridFromWorn(inv.items, hunter.id) : null), [inv, hunter]);

  if (!hunter || !ctx) return <Moment pose="ghost" title="No Hunter on this account">Steeped builds for Hunters. Make one and come back.</Moment>;
  if (err) return <Moment pose="ghost" title="Something went wrong">{err}</Moment>;
  if (!m) return <Moment pose="mug" title="Brewing your Hunter…">Checking every build you can make from your characters and vault. Under a minute, once per refresh.</Moment>;

  const c: Compare | undefined = m.compare?.find(x => x.role === job) ?? m.compare?.[0];
  const big = (m.farm ?? []).filter(r => r.kind === "power" || r.gain === undefined || r.gain >= 1);
  const small = (m.farm ?? []).filter(r => !big.includes(r));
  const wear = () => { if (c) setWearing(evaluate({ ...c.own.view.spec, goal: c.goal }, ctx, SETTINGS)); };

  return (
    <div className="space-y-6" data-testid="home">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Your strongest Hunter</h1>
          <p className="text-ink-dim">Power {Math.floor(m.power)} of 550{m.partial && " · still checking every exotic and weapon in the game"}</p>
        </div>
        <Segmented label="Job" value={job} options={JOBS} onChange={setJob} />
      </div>

      {c && (
        <section className="grid gap-4 md:grid-cols-3" data-testid="compare">
          <Column title="Wearing now" name={c.now ? buildName(c.now.spec) : "Hunter"} grades={c.now?.grades} rating={c.now?.rating} testId="col-now"
            grid={worn ? <LoadoutGrid {...worn} size={40} /> : null}
            foot={<p className="text-xs text-ink-dim">Your starting point</p>} />
          <Column title="Strongest you own" name={buildName(c.own.view.spec)} grades={c.own.grades} rating={100} delta={c.now ? 100 - c.now.rating : undefined} featured testId="col-own"
            grid={<LoadoutGrid {...gridFromView(c.own.view)} size={40} />}
            foot={<>
              {c.own.changes.length > 0
                ? <p className="text-sm text-ink-dim" data-testid="changes">{c.own.changes.slice(0, 3).join(", ")}{c.own.changes.length > 3 && ` and ${c.own.changes.length - 3} more`}</p>
                : <p className="text-sm text-good">You're already wearing it.</p>}
              {c.own.changes.length > 0 && <Button onClick={wear} data-testid="wear-this">Wear this</Button>}
            </>} />
          <Column title="Best possible" name={buildName(c.best.view.spec)} grades={m.partial ? undefined : c.best.grades} rating={m.partial ? undefined : c.best.rating} delta={m.partial ? undefined : c.best.rating - 100} testId="col-best"
            grid={<LoadoutGrid {...gridFromView(c.best.view)} size={40} />}
            foot={<>
              <p className="text-sm text-ink-dim">{m.partial ? "Checking every exotic and weapon in the game…" : c.best.missing ? `Needs ${c.best.missing} piece${c.best.missing > 1 ? "s" : ""} you don't have.` : c.best.rating > 100 ? "Your own gear, fully masterworked." : "Nothing in the game beats it yet."}</p>
              <Button variant="ghost" onClick={() => onGo("builds")}>See the build</Button>
            </>} />
        </section>
      )}

      <Card className="space-y-1 p-5" data-testid="farm">
        <h2 className="font-display text-2xl font-semibold">Your farm list</h2>
        <p className="pb-2 text-sm text-ink-dim">Ranked by what each one adds to your strongest build on its own.</p>
        {big.length === 0 && small.length === 0 && <p className="text-sm text-ink-dim">Nothing to farm: nothing Steeped knows beats what you own. It checks again after every refresh.</p>}
        <ul>{big.map(r => <FarmLine key={r.title} r={r} items={inv.items} />)}</ul>
        {small.length > 0 && (more
          ? <ul>{small.map(r => <FarmLine key={r.title} r={r} items={inv.items} />)}</ul>
          : <button type="button" className="pt-2 text-sm text-accent-hi hover:underline" onClick={() => setMore(true)}>Show {small.length} smaller gain{small.length > 1 ? "s" : ""} (under 1%)</button>)}
      </Card>

      {wearing && (
        <EquipDialog title={`Wear this: ${buildName(wearing.spec)}`} steps={equipPlan(wearing, ctx)} who={{ membershipType: inv.account.membershipType, characterId: ctx.characterId }} slots={inv.loadouts?.[ctx.characterId]}
          onStart={() => saveUndo(snapshotWorn(ctx))} onClose={() => setWearing(null)} onDone={() => onRefresh?.()} />
      )}

      <p className="text-center text-xs text-ink-dim">
        Want to customize it? <button type="button" className="text-accent-hi hover:underline" onClick={() => c && onOpen(c.own.view.spec)}>Open it in Builds</button>
      </p>
      {CLARITY_ON && (
        <p className="text-center text-xs text-ink-dim" data-testid="clarity-credit">
          Perk values are tested numbers from <a href={CLARITY_SITE} target="_blank" rel="noreferrer">Clarity</a>.{CLARITY_DISCORD && <> <a href={CLARITY_DISCORD} target="_blank" rel="noreferrer">Join their Discord</a>.</>}
        </p>
      )}
    </div>
  );
}

const GRADE_ROWS = [["clear", "Clear"], ["boss", "Boss"], ["survive", "Survive"]] as const;

function Column({ title, name, grades, rating, delta, grid, foot, featured, testId }: { title: string; name: string; grades?: Record<"clear" | "boss" | "survive", Grade>; rating?: number; delta?: number; grid: ReactNode; foot: ReactNode; featured?: boolean; testId: string }) {
  return (
    <Card className={cn("flex flex-col gap-3 p-5", featured && "border-2 border-accent-hi/70")} data-testid={testId}>
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hi">{title}</div>
        <div className="truncate font-display text-xl font-semibold" title={name}>{name}</div>
      </div>
      {grid}
      <dl className="divide-y divide-line border-y border-line text-sm">
        {GRADE_ROWS.map(([k, label]) => (
          <div key={k} className="flex items-center justify-between py-1.5">
            <dt className="text-ink-dim">{label}</dt>
            <dd>{grades ? <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", gradeClass(grades[k]))}>{grades[k]}</span> : <span className="text-ink-dim">…</span>}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between py-1.5">
          <dt className="text-ink-dim">Rating</dt>
          <dd className="font-display text-lg tabular-nums" data-testid={`${testId}-rating`}>{rating ?? "…"}{delta !== undefined && delta !== 0 && <span className={cn("ml-1.5 text-sm", delta > 0 ? "text-good" : "text-bad")}>{delta > 0 ? "+" : ""}{delta}</span>}</dd>
        </div>
      </dl>
      <div className="mt-auto space-y-2">{foot}</div>
    </Card>
  );
}

function FarmLine({ r, items }: { r: FarmRow; items: Item[] }) {
  const it = itemIn(r.title, items);
  const icon = r.kind === "power" ? "⬆" : r.kind === "upgrade" ? "✦" : "◆";
  const sub = [r.replaces && `Replaces ${r.replaces}`, r.inBuilds ? `In ${r.inBuilds} top build${r.inBuilds > 1 ? "s" : ""}` : undefined, r.where, r.kind !== "power" && (r.role === "Max Hunter" ? "All-round" : r.role.replace("Max Hunter", "All-round"))].filter(Boolean).join(" · ");
  return (
    <li className="flex items-center gap-3 border-t border-line py-3" data-testid="farm-row">
      {it ? <GearIcon src={iconForItem(it)} size={36} exotic={it.exotic} title={it.name} /> : <span className={cn("grid size-9 shrink-0 place-items-center rounded-md text-lg", r.kind === "farm" ? "bg-exotic/15 text-exotic" : "bg-accent/20 text-accent-hi")}>{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{r.title}{r.detail && <span className="font-normal text-ink-dim">, {r.detail}</span>}</div>
        <div className="text-xs text-ink-dim">{sub}</div>
      </div>
      <span className={cn("shrink-0 text-sm font-semibold", r.gain !== undefined ? "text-good" : "text-ink-dim")}>{r.kind === "power" ? "Power" : r.gain !== undefined ? `+${r.gain.toFixed(1)}%` : "Upgrade"}</span>
    </li>
  );
}
