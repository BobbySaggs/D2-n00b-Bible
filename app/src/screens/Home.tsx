import { useState } from "react";
import type { CatalogEntry } from "../bungie/catalog";
import { STAT_LABEL, STAT_ORDER } from "../bungie/config";
import type { Inventory } from "../model/inventory";
import type { BuildSpec } from "../engine/evaluate";
import type { Grade } from "../engine/maxhunter";
import { Badge, Button, Card, cn } from "../ui/kit";
import { Spinner } from "../ui/bits";
import { useMax } from "../ui/useMax";
import { CLARITY_DISCORD, CLARITY_ON, CLARITY_SITE } from "../bungie/clarity";

// Home is an overview: your Hunter right now, how to improve, gear to target, and what to play.
export const gradeTone = (g: Grade) => (g === "Great" ? "good" : g === "Good" ? "neutral" : "warn") as "good" | "neutral" | "warn";
export const buildName = (s: BuildSpec) => `${s.subclass === "Prismatic Hunter" ? "Prismatic" : s.subclass} · ${s.exotic}`;

export function Home({ inv, catalog, onOpen, onGo }: { inv: Inventory; catalog: CatalogEntry[]; onOpen: (spec: BuildSpec) => void; onGo: (screen: "builds" | "journey" | "inventory") => void }) {
  const hunter = inv.characters.find(c => c.cls === "Hunter");
  const { m, err } = useMax(inv, catalog);
  // Steps you tick off hide until the next refresh, which recomputes everything from your real gear.
  const [done, setDone] = useState<Set<string>>(() => new Set());

  if (!hunter) return <Card>Steeped builds for Hunters, and this account has no Hunter yet.</Card>;
  if (err) return <Card className="border-bad/40 text-bad">Steeped couldn't work out your overview: {err}</Card>;
  if (!m) return (
    <Card className="space-y-2" data-testid="home-loading">
      <Spinner label="Looking over your Hunter" />
      <p className="text-sm text-ink-dim">Steeped is checking every build you can make from your characters and vault. Under a minute, once per refresh.</p>
    </Card>
  );

  const steps = m.path.filter(p => !done.has(p.what));
  const clear = m.kit.find(k => k.goal === "whole"), boss = m.kit.find(k => k.goal === "bossDps");
  const jobs: { key: "clear" | "boss" | "survive"; label: string }[] = [{ key: "clear", label: "Clear rooms" }, { key: "boss", label: "Boss damage" }, { key: "survive", label: "Survive solo" }];

  return (
    <div className="space-y-6" data-testid="home">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="space-y-4 p-6" data-testid="me">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-hi">Your Hunter right now</div>
              <h1 className="font-display text-3xl font-semibold">{m.now ? buildName(m.now.spec) : "Hunter"}</h1>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold" data-testid="max-pct">{m.partial ? "…" : `${m.pct.toFixed(0)}%`}</span>
              <span className="text-ink-dim">{m.partial ? "checking every exotic" : "maxed"}</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {STAT_ORDER.map(k => {
              const v = hunter.stats[k];
              return (
                <div key={k} className={cn("rounded-xl border p-2.5", v >= 100 ? "border-accent-hi/50 bg-accent/20" : v < 60 ? "border-warn/40 bg-warn/10" : "border-line bg-panel-2")}>
                  <div className="text-xs text-ink-dim">{STAT_LABEL[k]}</div>
                  <div className="font-display text-2xl font-semibold tabular-nums">{v}</div>
                </div>
              );
            })}
          </div>
          {m.now && (
            <div className="grid gap-2 sm:grid-cols-3" data-testid="grades">
              {jobs.map(j => (
                <div key={j.key} className="space-y-1 rounded-xl border border-line bg-panel-2 p-3">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{j.label}</span><Badge tone={gradeTone(m.now!.grades[j.key])}>{m.now!.grades[j.key]}</Badge></div>
                  <div className="text-xs text-ink-dim">{m.now!.notes[j.key]}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-dim">
            <span>Power {m.power.toFixed(1)} of 550</span>
            {m.lowestSlot && <span>Lowest slot: {m.lowestSlot.slot} ({m.lowestSlot.power})</span>}
            <span>Gear {m.pillars.gear.toFixed(0)}% upgraded</span>
          </div>
          {m.now && m.now.rating < 100 && clear && (
            <Button size="sm" variant="ghost" onClick={() => onOpen(clear.view.spec)}>Swap to your best build</Button>
          )}
        </Card>

        <Card className="space-y-4 p-6" data-testid="improve">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-hi">How to improve</div>
            <h2 className="font-display text-2xl font-semibold">Biggest gains first</h2>
          </div>
          {steps.length === 0 && <p className="text-ink-dim">Nothing left. Your Hunter is as maxed as Steeped can make it.</p>}
          <ol className="space-y-3">
            {steps.slice(0, 6).map(p => (
              <li key={p.what} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium" data-testid="improve-step">{p.what}</div>
                  <div className="text-sm text-ink-dim">{p.why}</div>
                </div>
                <div className="flex flex-none flex-col items-end gap-1">
                  <span className="text-sm font-semibold text-good">+{p.gain.toFixed(1)}%</span>
                  <button type="button" className="text-xs text-ink-dim underline-offset-2 hover:text-ink hover:underline" onClick={() => setDone(d => new Set(d).add(p.what))}>Done</button>
                </div>
              </li>
            ))}
          </ol>
          <Button size="sm" variant="quiet" onClick={() => onGo("journey")}>See your full Journey</Button>
        </Card>
      </div>

      <section className="space-y-3" data-testid="targets">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Gear to target</h2>
          <span className="text-sm text-ink-dim">What would make your builds stronger, and where to get it</span>
        </div>
        {m.targets.length === 0 ? <Card className="text-ink-dim">Nothing to chase right now. Steeped checks again after every refresh.</Card> : (
          <div className="grid gap-4 md:grid-cols-3">
            {m.targets.slice(0, 6).map(t => (
              <Card key={t.title} className="space-y-2">
                <div className="flex items-start justify-between gap-2"><span className="font-semibold">{t.title}</span><Badge>{t.tag}</Badge></div>
                <p className="text-sm text-ink-dim">{t.why}</p>
                <p className="text-sm"><span className="font-semibold">Where:</span> <span className="text-ink-dim">{t.where}</span></p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3" data-testid="play">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">What to play</h2>
          <span className="text-sm text-ink-dim">Picked for what gets you closest to max</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <PlayCard title="Solo Ops, Expert, Grade A+" tag="Solo"
            why={m.power < 550 ? "Climbs your Power toward 550 and drops Tier 5 gear. Add modifiers until it shows A or better." : "Tier 5 drops with better rolls for your builds."}
            wear={clear ? buildName(clear.view.spec) : "Your best build"} />
          <PlayCard title="A dungeon or raid with friends" tag="Fireteam"
            why="Clear with your main build, then swap for the damage phase so the boss goes down in fewer phases."
            wear={clear && boss ? `${buildName(clear.view.spec)}, then ${buildName(boss.view.spec)} at the boss` : "Your best build"} />
          <PlayCard title="This week's Grandmaster" tag="Coming soon"
            why="Steeped will read this week's champions and modifiers and adjust your build for them."
            wear="Your best build for now" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => onGo("builds")}>See your builds</Button>
          <Button size="sm" variant="ghost" onClick={() => onGo("inventory")}>Clean up your vault</Button>
        </div>
      </section>

      {CLARITY_ON && (
        <Card className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="clarity-credit">
          <span className="text-ink-dim">Perk values are tested numbers from <a href={CLARITY_SITE} target="_blank" rel="noreferrer">Clarity</a>, the community&apos;s perk database.</span>
          {CLARITY_DISCORD && <a href={CLARITY_DISCORD} target="_blank" rel="noreferrer">Join the Clarity Discord</a>}
        </Card>
      )}
    </div>
  );
}

function PlayCard({ title, tag, why, wear }: { title: string; tag: string; why: string; wear: string }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2"><span className="font-display text-lg font-semibold">{title}</span><Badge>{tag}</Badge></div>
      <p className="text-sm text-ink-dim">{why}</p>
      <p className="text-sm"><span className="font-semibold">Wear:</span> <span className="text-ink-dim">{wear}</span></p>
    </Card>
  );
}
