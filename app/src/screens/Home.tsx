import { useEffect, useState } from "react";
import { DEFS } from "../bungie/defs";
import type { CatalogEntry } from "../bungie/catalog";
import { STAT_LABEL, STAT_ORDER } from "../bungie/config";
import type { Inventory } from "../model/inventory";
import type { BuildSpec } from "../engine/evaluate";
import type { MaxHunter, Report } from "../engine/maxhunter";
import { runMax } from "../workers/search";
import { Badge, Button, Card, cn } from "../ui/kit";
import { Spinner } from "../ui/bits";
import { GearIcon, iconForItem } from "../ui/gear";

// Home: how maxed your Hunter is, the one thing to do next, the path to 100%, and a report on each build in your kit.
export function Home({ inv, catalog, onOpen, onInventory }: { inv: Inventory; catalog: CatalogEntry[]; onOpen: (spec: BuildSpec) => void; onInventory: () => void }) {
  const hunter = inv.characters.find(c => c.cls === "Hunter");
  const [m, setM] = useState<MaxHunter | null>(null);
  const [err, setErr] = useState("");
  // Steps you tick off hide until the next refresh, which recomputes the path from your real gear.
  const [done, setDone] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!hunter) return;
    let live = true;
    setErr("");
    const defs = [...DEFS.values()];
    const fail = (e: unknown) => { if (live) setErr(e instanceof Error ? e.message : String(e)); };
    // First your kit and path, then the slower check against every exotic in the game.
    runMax(inv, defs, hunter.id, catalog, false).then(r => {
      if (!live) return;
      setM(cur => cur ?? r);
      return runMax(inv, defs, hunter.id, catalog, true).then(full => { if (live) setM(full); });
    }).catch(fail);
    return () => { live = false; };
  }, [inv, hunter, catalog]);

  if (!hunter) return <Card>Steeped builds for Hunters, and this account has no Hunter yet.</Card>;
  if (err) return <Card className="border-bad/40 text-bad">Steeped couldn't work out your path: {err}</Card>;
  if (!m) return (
    <Card className="space-y-2" data-testid="home-loading">
      <Spinner label="Working out how maxed your Hunter is" />
      <p className="text-sm text-ink-dim">Steeped is searching every build you can make from your characters and vault. This takes under a minute, once per refresh.</p>
    </Card>
  );

  const steps = m.path.filter(p => !done.has(p.what));
  const next = steps[0];
  const markDone = (what: string) => setDone(d => new Set(d).add(what));

  return (
    <div className="space-y-6" data-testid="home">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="space-y-5 p-7">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-hi">{next ? "Your next step" : "Nothing left on your path"}</div>
            <h1 className="font-display text-3xl font-semibold leading-tight" data-testid="next-step">{next ? next.what : "Your Hunter is as maxed as Steeped can make it"}</h1>
            {next && <p className="max-w-2xl text-ink-dim">{next.why}. <span className="text-good">+{next.gain.toFixed(1)}% Max Hunter</span></p>}
          </div>
          {next && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => markDone(next.what)}>I did this</Button>
              {next.kind === "gear" && <Button variant="ghost" onClick={onInventory}>Find it in my inventory</Button>}
            </div>
          )}
          {steps.length > 1 && (
            <div className="space-y-3 border-t border-line pt-4">
              <div className="text-sm font-semibold text-ink-dim">Then</div>
              <ol className="space-y-3">
                {steps.slice(1, 8).map((p, i) => (
                  <li key={p.what} className="flex items-start gap-3">
                    <span className="flex size-7 flex-none items-center justify-center rounded-full bg-panel-2 text-xs font-semibold text-accent-hi">{i + 2}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{p.what} <span className="text-sm text-good">+{p.gain.toFixed(1)}%</span></div>
                      <div className="text-sm text-ink-dim">{p.why}</div>
                    </div>
                    <Button size="sm" variant="quiet" onClick={() => markDone(p.what)} aria-label={`Mark ${p.what} done`}>Done</Button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>

        <Card className="space-y-5 p-7">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-dim">Max Hunter</div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold" data-testid="max-pct">{m.partial ? "…" : `${m.pct.toFixed(1)}%`}</span>
              <span className="text-ink-dim">{m.partial ? "checking every exotic in the game" : "maxed"}</span>
            </div>
          </div>
          <Bar label="Power" pct={m.pillars.power} note={`${m.power.toFixed(1)} of 550${m.lowestSlot ? `, lowest slot: ${m.lowestSlot.slot} (${m.lowestSlot.power})` : ""}`} />
          <Bar label="Gear" pct={m.pillars.gear} note="Your build pieces masterworked, at Tier 5 and at your Power" />
          {m.partial ? <Spinner label="Builds: comparing with every exotic in the game" /> : <Bar label="Builds" pct={m.pillars.builds} note="Your best builds against the best possible with every exotic in the game" />}
          <p className="text-xs text-ink-dim">Power counts 40%, Gear 30%, Builds 30%. Searched {inv.characters.length} characters, your vault and {catalog.length} exotics from Collections.</p>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Your kit</h2>
          <span className="text-sm text-ink-dim">Stars compare each build with the best Steeped found for you, job by job</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {m.reports.map(r => <ReportCard key={r.role} r={r} onOpen={() => onOpen(r.view.spec)} />)}
        </div>
      </section>
    </div>
  );
}

function Bar({ label, pct, note }: { label: string; pct: number; note: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-ink-dim">{pct.toFixed(0)}%</span></div>
      <div role="img" aria-label={`${label} ${pct.toFixed(0)}%`} className="h-2 overflow-hidden rounded-full bg-panel-2">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="text-xs text-ink-dim">{note}</div>
    </div>
  );
}

function Stars({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-panel-2 px-3 py-2">
      <span className="text-sm text-ink-dim">{label}</span>
      <span aria-label={`${n} of 5 stars`} className="tracking-wider text-exotic">
        {[1, 2, 3, 4, 5].map(i => <span key={i} className={i <= n ? "" : i - 0.5 === n ? "opacity-60" : "opacity-20"}>★</span>)}
      </span>
    </div>
  );
}

function ReportCard({ r, onOpen }: { r: Report; onOpen: () => void }) {
  const v = r.view, sp = v.spec;
  const pieces = [...Object.values(v.armor?.pieces ?? {}).map(p => p.item), ...v.weapons.filter(Boolean).map(w => w!.item)];
  const tone = r.confidence === "High" ? "good" : r.confidence === "Medium" ? "neutral" : "warn";
  return (
    <Card className="space-y-4" data-testid="report">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-dim">{r.role}</div>
          <h3 className="font-display text-xl font-semibold">{sp.subclass}: {sp.aspects.join(" + ")}</h3>
          <p className="text-sm text-ink-dim">{r.verdict}</p>
        </div>
        <Badge tone={tone}>{r.confidence} confidence</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Stars n={r.stars.clear} label="Clear" />
        <Stars n={r.stars.boss} label="Boss" />
        <Stars n={r.stars.survive} label="Survive" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pieces.map(i => <GearIcon key={i.id} src={iconForItem(i)} size={40} exotic={i.exotic} title={i.name} mw={i.masterworked} />)}
      </div>
      <div className="text-sm text-ink-dim">
        {sp.super} · {sp.grenade} · {sp.melee} · {sp.classAbility} · {sp.exotic}
      </div>
      <div className="flex flex-wrap gap-2">
        {STAT_ORDER.map(k => (
          <span key={k} className={cn("rounded-lg px-2 py-1 text-xs tabular-nums", v.stats[k] >= 100 ? "bg-accent/25 text-ink" : "bg-panel-2 text-ink-dim")}>{STAT_LABEL[k]} {v.stats[k]}</span>
        ))}
      </div>
      {r.why.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Why it works</div>
          {r.why.map(w => <p key={w.name} className="text-sm"><span className="font-medium">{w.name}:</span> <span className="text-ink-dim">{w.play}</span></p>)}
        </div>
      )}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">Where it shines</dt><dd className="text-ink-dim">{r.shines}</dd></div>
        <div><dt className="font-semibold">Where it struggles</dt><dd className="text-ink-dim">{r.struggles}</dd></div>
        <div><dt className="font-semibold">To run it at full strength</dt><dd className="text-ink-dim">{r.cost.length ? r.cost.join("; ") : "Ready to wear"}</dd></div>
        <div><dt className="font-semibold">How sure Steeped is</dt><dd className="text-ink-dim">{r.confidenceWhy}</dd></div>
      </dl>
      {v.loops.survives.length > 0 && <p className="text-sm text-warn">Not solo-ready: {v.loops.survives.join(", ")}.</p>}
      <Button size="sm" variant="ghost" onClick={onOpen}>Open in the Builder to equip</Button>
    </Card>
  );
}

