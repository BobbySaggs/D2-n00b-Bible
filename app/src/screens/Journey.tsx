import { useMemo, useState } from "react";
import type { CatalogEntry, Catalyst } from "../bungie/catalog";
import type { Quest } from "../bungie/quests";
import { STAT_ORDER } from "../bungie/config";
import type { Inventory } from "../model/inventory";
import { Badge, Card, cn } from "../ui/kit";
import { Mascot, Moment, Ring } from "../ui/visual";
import { GearIcon, iconForItem } from "../ui/gear";
import { useMax } from "../ui/useMax";
import { Path } from "./Path";

// Journey: every max that matters, where you are, and what to run to get there. Campaigns live at the bottom.
export function Journey({ inv, catalog, catalysts, artifact, quests }: {
  inv: Inventory; catalog: CatalogEntry[]; catalysts: Catalyst[]; artifact?: { level: number; cap: number }; quests: Quest[];
}) {
  const { m, err } = useMax(inv, catalog);
  const [showAll, setShowAll] = useState(false);
  // Catalysts that matter most come first: guns in your builds, then exotics you own.
  const owned = useMemo(() => new Set(inv.items.filter(i => i.kind === "weapon" && i.exotic).map(i => i.name)), [inv]);
  const kitGuns = new Set((m?.kit ?? []).flatMap(k => k.view.weapons.filter(Boolean).map(w => w!.item.name)));
  const cats = useMemo(() => [...catalysts].sort((a, b) =>
    Number(a.done) - Number(b.done) || Number(kitGuns.has(b.weapon)) - Number(kitGuns.has(a.weapon)) || Number(owned.has(b.weapon)) - Number(owned.has(a.weapon)) || a.weapon.localeCompare(b.weapon)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [catalysts, owned, m]);
  const catDone = catalysts.filter(c => c.done).length;
  const todo = cats.filter(c => !c.done);

  if (err) return <Moment pose="ghost" title="Something went wrong">{err}</Moment>;
  const best = m?.possible.find(p => p.role === "Max Hunter")?.view;
  const at100 = best ? STAT_ORDER.filter(k => best.stats[k] >= 100).length : 0;

  return (
    <div className="space-y-6" data-testid="journey">
      <div className="space-y-1">
        <div className="flex items-center gap-4">
          <Mascot pose="point" size={72} />
          <div>
            <h1 className="font-display text-3xl font-semibold">Journey to a maxed {m?.cls ?? "Guardian"}</h1>
            <p className="text-ink-dim">Every max that matters, and what to run to get there.</p>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Your maxes</h2>
        {!m ? <Moment pose="mug" title="Brewing your progress…" /> : (
          <div className="grid gap-4 md:grid-cols-3" data-testid="maxes">
            <Max label="Power" now={String(Math.floor(m.power))} goal="550" pct={(100 * m.power) / 550} how={m.power < 550 ? `Run Solo Ops at Grade A or better. Raise your lowest slot first${m.lowestSlot ? ` (${m.lowestSlot.slot}, ${m.lowestSlot.power})` : ""}.` : "Maxed."} />
            <Max label="Build gear upgraded" now={`${m.pillars.gear.toFixed(0)}%`} goal="100%" pct={m.pillars.gear} how="Masterwork, infuse and upgrade the pieces your builds use. Steps are below." />
            <Max label="Stats at 100+ in your best build" now={`${at100}`} goal="6" pct={(100 * at100) / 6} how="Counted with every piece masterworked. Tier 5 armor with the right rolls adds more." />
            <Max label="Exotics for your builds" now={m.partial ? "…" : m.pillars.builds >= 99.5 ? "All" : `${m.pillars.builds.toFixed(0)}%`} goal="All" pct={m.partial ? 0 : m.pillars.builds} how={m.pillars.builds >= 99.5 ? "Nothing you're missing would make you stronger." : "See Gear to target on Home for what to get and where."} />
            <Max label="Exotic catalysts" now={`${catDone}`} goal={`${catalysts.length || "?"}`} pct={catalysts.length ? (100 * catDone) / catalysts.length : 0} how={catalysts.length ? "Finish the ones for guns in your builds first. The list is below." : "Bungie's catalyst list loads after your next refresh."} />
            <Max label="Artifact" now={artifact ? `Level ${artifact.level}` : "?"} goal={artifact ? `${artifact.cap}` : "?"} pct={artifact && artifact.cap ? (100 * artifact.level) / artifact.cap : 0} how={artifact && artifact.level >= artifact.cap ? "Maxed. Every perk slot is open." : "Earn XP in any activity to unlock more perk slots."} />
          </div>
        )}
      </section>

      {m && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-semibold">What to run, in order</h2>
          <Card>
            <ol className="space-y-3" data-testid="journey-steps">
              {m.path.map((p, i) => (
                <li key={p.what} className="flex items-start gap-3">
                  <span className="flex size-7 flex-none items-center justify-center rounded-full bg-panel-2 text-xs font-semibold text-accent-hi">{i + 1}</span>
                  <div className="min-w-0 flex-1"><div className="font-medium">{p.what}</div><div className="text-sm text-ink-dim">{p.why}</div></div>
                  <Badge tone="good">+{p.gain.toFixed(1)}%</Badge>
                </li>
              ))}
              {m.path.length === 0 && <li className="text-ink-dim">Nothing left on your path.</li>}
            </ol>
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-semibold">Exotic catalysts</h2>
          <span className="text-sm text-ink-dim">{catalysts.length ? `${catDone} of ${catalysts.length} done` : "Loads with Bungie's records"}</span>
        </div>
        {catalysts.length > 0 && (
          <Card className="space-y-2" data-testid="catalysts">
            {(showAll ? todo : todo.slice(0, 10)).map(c => (
              <div key={c.record} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-3">
                  {(() => { const it = inv.items.find(i => i.name === c.weapon); return it ? <GearIcon src={iconForItem(it)} size={36} exotic title={it.name} /> : <span className="size-9 rounded-md border border-dashed border-line" />; })()}
                  <span className={cn("font-medium", !owned.has(c.weapon) && "text-ink-dim")}>{c.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  {c.progress && <span className="text-xs text-ink-dim">{c.progress}</span>}
                  {kitGuns.has(c.weapon) ? <Badge tone="good">In your builds</Badge> : owned.has(c.weapon) ? <Badge>You own it</Badge> : <Badge>Gun not owned</Badge>}
                </span>
              </div>
            ))}
            {todo.length > 10 && <button type="button" className="text-sm text-accent-hi" onClick={() => setShowAll(s => !s)}>{showAll ? "Show fewer" : `Show all ${todo.length} unfinished`}</button>}
            {!todo.length && <p className="text-ink-dim">Every catalyst done.</p>}
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl font-semibold">Campaigns and quests</h2>
        <Path inv={inv} quests={quests} />
      </section>
    </div>
  );
}

function Max({ label, now, goal, pct, how }: { label: string; now: string; goal: string; pct: number; how: string }) {
  const maxed = pct >= 99.5;
  return (
    <Card className="flex items-center gap-4">
      {maxed ? <Mascot pose="cheer" size={84} /> : <Ring pct={pct} size={84} label={`${Math.round(pct)}%`} />}
      <div className="min-w-0 space-y-1">
        <div className="font-semibold">{label}</div>
        <div className="font-display text-xl font-semibold tabular-nums">{now} <span className="text-sm font-normal text-ink-dim">of {goal}</span></div>
        <p className="text-xs text-ink-dim">{maxed ? "Maxed." : how}</p>
      </div>
    </Card>
  );
}
