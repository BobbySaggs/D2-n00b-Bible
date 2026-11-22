import { useState } from "react";
import type { CatalogEntry } from "../bungie/catalog";
import type { Inventory } from "../model/inventory";
import type { BuildSpec, BuildView } from "../engine/evaluate";
import type { Possible, Report } from "../engine/maxhunter";
import { Badge, Button, Card } from "../ui/kit";
import { Segmented } from "../ui/bits";
import { LoadoutGrid, Moment, StatBars, gridFromView } from "../ui/visual";
import { useMax } from "../ui/useMax";
import { buildName } from "./Home";

// Builds: the best you can wear tonight next to the strongest Hunter possible, and how to get from one to the other.
type Role = "Max Hunter" | "Boss damage";

export function Builds({ inv, catalog, onOpen }: { inv: Inventory; catalog: CatalogEntry[]; onOpen: (spec: BuildSpec) => void }) {
  const { m, err } = useMax(inv, catalog);
  const [role, setRole] = useState<Role>("Max Hunter");
  if (err) return <Moment pose="ghost" title="Something went wrong">{err}</Moment>;
  if (!m) return <Moment pose="mug" title="Brewing your builds…">Searching everything you own for your strongest Hunter.</Moment>;
  const report = m.reports.find(r => r.role === role);
  const possible = m.possible.find(p => p.role === role);

  return (
    <div className="space-y-5" data-testid="builds">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-semibold">Your strongest Hunter</h1>
        <p className="text-ink-dim">Tonight's best on the left. The most powerful version possible on the right, and how to get there.</p>
      </div>
      <Segmented label="Build for" value={role} onChange={setRole} options={[{ value: "Max Hunter", label: "All-round monster" }, { value: "Boss damage", label: "Boss damage" }]} />
      <div className="grid gap-5 lg:grid-cols-2">
        {report && <NowColumn r={report} onOpen={() => onOpen(report.view.spec)} />}
        {m.partial ? <Moment pose="mug" title="Checking every exotic in the game…" /> : possible && <PossibleColumn p={possible} />}
      </div>
    </div>
  );
}

function Pieces({ v }: { v: BuildView }) { return <LoadoutGrid {...gridFromView(v)} size={52} />; }
function Stats({ v }: { v: BuildView }) { return <StatBars stats={v.stats} compact />; }
function Loadout({ v }: { v: BuildView }) {
  const s = v.spec;
  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-2">
      <div><dt className="text-ink-dim">Abilities</dt><dd>{s.super} · {s.grenade} · {s.melee} · {s.classAbility}</dd></div>
      <div><dt className="text-ink-dim">Aspects</dt><dd>{s.aspects.join(" + ")}</dd></div>
      <div><dt className="text-ink-dim">Weapons</dt><dd>{v.weapons.filter(Boolean).map(w => w!.item.name).join(", ")}</dd></div>
      <div><dt className="text-ink-dim">Artifact</dt><dd>{s.artifact ?? "Your current one"}</dd></div>
    </dl>
  );
}
// The research behind a build: every rule it rests on that names a source (Bungie notes, credited guides).
function Research({ v, note }: { v: BuildView; note?: string }) {
  const parts = [...v.coreParts.map(p => p.k), ...v.perkParts.map(p => p.k), ...v.weapons.flatMap(w => (w ? w.ks : []))];
  const srcs = [...new Map(parts.filter(k => k.src).map(k => [k.name, k.src!])).entries()];
  const combos = v.loops.combos.filter(c => c.src).map(c => [c.name, c.src!] as [string, string]);
  const all = [...combos, ...srcs].slice(0, 10);
  if (!all.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold">The research behind it</summary>
      {note && <p className="mt-2 text-ink-dim">{note}.</p>}
      <ul className="mt-2 space-y-1">{all.map(([n, s]) => <li key={n}><span className="font-medium">{n}:</span> <span className="text-ink-dim">{s}</span></li>)}</ul>
    </details>
  );
}

function NowColumn({ r, onOpen }: { r: Report; onOpen: () => void }) {
  const v = r.view;
  return (
    <Card className="space-y-4" data-testid="build-now">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-hi">Best you can build now</div>
          <h2 className="font-display text-2xl font-semibold">{buildName(v.spec)}</h2>
          <p className="text-sm text-ink-dim">Ready tonight, from your characters and vault.</p>
        </div>
        <Badge tone={r.confidence === "Proven" ? "good" : r.confidence === "Mostly proven" ? "neutral" : "warn"}>{r.confidence}</Badge>
      </div>
      <Pieces v={v} />
      <Stats v={v} />
      <Loadout v={v} />
      {r.why.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-semibold">How it plays</div>
          {r.why.slice(0, 2).map(w => <p key={w.name} className="text-sm"><span className="font-medium">{w.name}:</span> <span className="text-ink-dim">{w.play}</span></p>)}
        </div>
      )}
      {r.cost.length > 0 && <p className="text-sm"><span className="font-semibold">Before you equip:</span> <span className="text-ink-dim">{r.cost.join("; ")}</span></p>}
      <Research v={v} note={r.confidenceWhy} />
      <Button onClick={onOpen}>Equip or customize</Button>
    </Card>
  );
}

function PossibleColumn({ p }: { p: Possible }) {
  const v = p.view;
  return (
    <Card className="space-y-4" data-testid="build-possible">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-hi">Best possible, regardless of gear</div>
        <h2 className="font-display text-2xl font-semibold">{buildName(v.spec)}{p.sameCore ? ", perfected" : ""}</h2>
        <p className="text-sm text-ink-dim">{p.sameCore ? "Nothing in the game beats it. Perfect what you own." : "Uses gear you don't have yet."}</p>
      </div>
      <Pieces v={v} />
      <Stats v={v} />
      <Loadout v={v} />
      <div className="space-y-2">
        <div className="text-sm font-semibold">How to get there</div>
        <ol className="space-y-2">
          {p.steps.map((s, i) => (
            <li key={s.what} className="flex items-start gap-3">
              <span className="flex size-6 flex-none items-center justify-center rounded-full bg-panel-2 text-xs font-semibold text-accent-hi">{i + 1}</span>
              <div><div className="text-sm font-medium">{s.what}</div><div className="text-xs text-ink-dim">{s.why}</div></div>
            </li>
          ))}
        </ol>
      </div>
      <Research v={v} />
    </Card>
  );
}
