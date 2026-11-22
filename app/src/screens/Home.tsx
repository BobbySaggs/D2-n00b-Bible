import { useMemo, useState } from "react";
import type { CatalogEntry } from "../bungie/catalog";
import type { Inventory, Item } from "../model/inventory";
import type { BuildSpec } from "../engine/evaluate";
import type { Grade } from "../engine/maxhunter";
import { Button, Card, cn } from "../ui/kit";
import { useMax } from "../ui/useMax";
import { GearIcon, iconForItem } from "../ui/gear";
import { EmblemBanner, LoadoutGrid, Mascot, Moment, Ring, StatBars, gradeClass, gridFromWorn, type Pose } from "../ui/visual";
import { CLARITY_DISCORD, CLARITY_ON, CLARITY_SITE } from "../bungie/clarity";

// Home is an overview: your Hunter right now, how to improve, gear to target, and what to play.
export const gradeTone = (g: Grade) => (g === "Great" ? "good" : g === "Good" ? "neutral" : "warn") as "good" | "neutral" | "warn";
export const buildName = (s: BuildSpec) => `${s.subclass === "Prismatic Hunter" ? "Prismatic" : s.subclass} · ${s.exotic}`;

// The item a step or target talks about, so it can show its icon (longest name wins: "Iron Battalion Strides" over "Iron").
export function itemIn(text: string, items: Item[]): Item | undefined {
  let best: Item | undefined;
  for (const i of items) if ((i.kind === "weapon" || i.kind === "armor") && text.includes(i.name) && (!best || i.name.length > best.name.length || (i.name === best.name && i.power > best.power))) best = i;
  return best;
}

export function Home({ inv, catalog, onOpen, onGo }: { inv: Inventory; catalog: CatalogEntry[]; onOpen: (spec: BuildSpec) => void; onGo: (screen: "builds" | "journey" | "inventory") => void }) {
  const hunter = inv.characters.find(c => c.cls === "Hunter");
  const { m, err } = useMax(inv, catalog);
  // Steps you tick off hide until the next refresh, which recomputes everything from your real gear.
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const worn = useMemo(() => (hunter ? gridFromWorn(inv.items, hunter.id) : null), [inv, hunter]);

  if (!hunter) return <Moment pose="ghost" title="No Hunter on this account">Steeped builds for Hunters. Make one and come back.</Moment>;
  if (err) return <Moment pose="ghost" title="Something went wrong">{err}</Moment>;
  if (!m) return <Moment pose="mug" title="Brewing your overview…">Checking every build you can make from your characters and vault. Under a minute, once per refresh.</Moment>;

  const steps = m.path.filter(p => !done.has(p.what));
  const clear = m.kit.find(k => k.goal === "whole"), boss = m.kit.find(k => k.goal === "bossDps");
  const jobs: { key: "clear" | "boss" | "survive"; label: string }[] = [{ key: "clear", label: "Clear" }, { key: "boss", label: "Boss" }, { key: "survive", label: "Survive" }];

  return (
    <div className="space-y-6" data-testid="home">
      <EmblemBanner bg={hunter.emblemBg}>
        <div className="grid items-center gap-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]" data-testid="me">
          <div className="flex items-center gap-5">
            <Ring pct={m.partial ? 0 : m.pct} size={132} label={m.partial ? "…" : `${m.pct.toFixed(0)}%`} sub="maxed" testId="max-pct" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hi">Power</div>
              <div className="font-display text-4xl font-semibold leading-none">{m.power.toFixed(0)}</div>
              <div className="text-sm text-ink-dim">of 550</div>
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hi">Wearing now</div>
              <h1 className="truncate font-display text-2xl font-semibold">{m.now ? buildName(m.now.spec) : "Hunter"}</h1>
            </div>
            {worn && <LoadoutGrid {...worn} size={48} />}
            {m.now && (
              <div className="flex flex-wrap gap-2" data-testid="grades">
                {jobs.map(j => (
                  <span key={j.key} title={m.now!.notes[j.key]} className={cn("rounded-full border px-3 py-1 text-sm font-medium", gradeClass(m.now!.grades[j.key]))}>{j.label}: {m.now!.grades[j.key]}</span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3">
            <StatBars stats={hunter.stats} compact />
            {m.now && m.now.rating < 100 && clear && <Button size="sm" onClick={() => onOpen(clear.view.spec)}>Swap to your best build</Button>}
          </div>
        </div>
      </EmblemBanner>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="space-y-4 p-6" data-testid="improve">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hi">How to improve</div>
              <h2 className="font-display text-2xl font-semibold">Do these next</h2>
            </div>
            <Mascot pose="point" size={76} className="-my-3" />
          </div>
          {steps.length === 0 ? <Moment pose="cheer" title="Nothing left to do">Your Hunter is as maxed as Steeped can make it.</Moment> : (
            <ol className="space-y-2.5">
              {steps.slice(0, 5).map(p => {
                const it = itemIn(p.what, inv.items);
                return (
                  <li key={p.what} className="flex items-center gap-3 rounded-xl bg-panel-2 p-2.5">
                    {it ? <GearIcon src={iconForItem(it)} size={40} exotic={it.exotic} title={it.name} /> : <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent/25 font-display text-lg text-accent-hi">{p.kind === "power" ? "⬆" : "★"}</span>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium" data-testid="improve-step">{p.what}</div>
                      <div className="truncate text-xs text-ink-dim">{p.why}</div>
                    </div>
                    <span className="shrink-0 font-display text-lg font-semibold text-good">+{p.gain.toFixed(1)}%</span>
                    <button type="button" aria-label={`Mark ${p.what} done`} className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-ink-dim hover:text-ink" onClick={() => setDone(d => new Set(d).add(p.what))}>Done</button>
                  </li>
                );
              })}
            </ol>
          )}
          <button type="button" className="text-sm text-accent-hi hover:underline" onClick={() => onGo("journey")}>Your full Journey →</button>
        </Card>

        <Card className="space-y-4 p-6" data-testid="targets">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-hi">Gear to target</div>
            <h2 className="font-display text-2xl font-semibold">Chase these</h2>
          </div>
          {m.targets.length === 0 ? <Moment pose="sit" title="Nothing to chase">You own everything your builds want. Steeped checks again after every refresh.</Moment> : (
            <ul className="space-y-2.5">
              {m.targets.slice(0, 4).map(t => {
                const it = itemIn(t.title, inv.items);
                return (
                  <li key={t.title} className="flex items-center gap-3 rounded-xl bg-panel-2 p-2.5">
                    {it ? <GearIcon src={iconForItem(it)} size={40} exotic={it.exotic} title={it.name} /> : <span className="grid size-10 shrink-0 place-items-center rounded-md bg-exotic/15 text-lg text-exotic">◆</span>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{t.title}</div>
                      <div className="truncate text-xs text-ink-dim">{t.where}</div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-ink-dim">{t.tag}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <section className="space-y-3" data-testid="play">
        <h2 className="font-display text-2xl font-semibold">What to play</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <PlayCard pose="stand" title="Solo Ops at Grade A+" tag="Solo" line={m.power < 550 ? "Climbs your Power and drops Tier 5 gear." : "Tier 5 drops for better rolls."} wear={clear ? buildName(clear.view.spec) : "Your best build"} />
          <PlayCard pose="crouch" title="Dungeon or raid" tag="Fireteam" line="Clear with your main build, swap at the boss." wear={clear && boss ? `${buildName(clear.view.spec)} → ${buildName(boss.view.spec)}` : "Your best build"} />
          <PlayCard pose="sit" title="This week's Grandmaster" tag="Soon" line="Steeped will tune your build for this week's champions." wear="Your best build for now" />
        </div>
      </section>

      {CLARITY_ON && (
        <p className="text-center text-xs text-ink-dim" data-testid="clarity-credit">
          Perk values are tested numbers from <a href={CLARITY_SITE} target="_blank" rel="noreferrer">Clarity</a>.{CLARITY_DISCORD && <> <a href={CLARITY_DISCORD} target="_blank" rel="noreferrer">Join their Discord</a>.</>}
        </p>
      )}
    </div>
  );
}

function PlayCard({ pose, title, tag, line, wear }: { pose: Pose; title: string; tag: string; line: string; wear: string }) {
  return (
    <Card className="relative flex items-center gap-4 overflow-hidden">
      <Mascot pose={pose} size={72} />
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2"><span className="font-display text-lg font-semibold">{title}</span><span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-ink-dim">{tag}</span></div>
        <p className="text-sm text-ink-dim">{line}</p>
        <p className="truncate text-xs"><span className="text-ink-dim">Wear </span>{wear}</p>
      </div>
    </Card>
  );
}
