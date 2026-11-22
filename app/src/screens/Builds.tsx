import { useState } from "react";
import type { CatalogEntry } from "../bungie/catalog";
import { STAT_LABEL, STAT_ORDER } from "../bungie/config";
import type { Inventory } from "../model/inventory";
import type { BuildSpec, BuildView } from "../engine/evaluate";
import type { Possible, Report } from "../engine/maxhunter";
import { Badge, Button, Card, cn } from "../ui/kit";
import { Segmented, Spinner } from "../ui/bits";
import { GearIcon, iconForItem } from "../ui/gear";
import { useMax } from "../ui/useMax";
import { buildName } from "./Home";

// Builds: the best you can wear tonight next to the strongest Hunter possible, and how to get from one to the other.
type Role = "Max Hunter" | "Boss damage";

export function Builds({ inv, catalog, onOpen }: { inv: Inventory; catalog: CatalogEntry[]; onOpen: (spec: BuildSpec) => void }) {
  const { m, err } = useMax(inv, catalog);
  const [role, setRole] = useState<Role>("Max Hunter");
  if (err) return <Card className="border-bad/40 text-bad">{err}</Card>;
  if (!m) return <Card><Spinner label="Finding your strongest builds" /></Card>;
  const report = m.reports.find(r => r.role === role);
  const possible = m.possible.find(p => p.role === role);

  return (
    <div className="space-y-5" data-testid="builds">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-semibold">Your strongest Hunter</h1>
        <p className="text-ink-dim">Left: the best you can wear tonight from your gear. Right: the most powerful Hunter possible with anything in the game, every piece masterworked, and exactly how to get there.</p>
      </div>
      <Segmented label="Build for" value={role} onChange={setRole} options={[{ value: "Max Hunter", label: "All-round monster" }, { value: "Boss damage", label: "Boss damage" }]} />
      <div className="grid gap-5 lg:grid-cols-2">
        {report && <NowColumn r={report} onOpen={() => onOpen(report.view.spec)} />}
        {m.partial ? <Card><Spinner label="Checking every exotic in the game" /></Card> : possible && <PossibleColumn p={possible} />}
      </div>
    </div>
  );
}

function Pieces({ v }: { v: BuildView }) {
  const items = [...Object.values(v.armor?.pieces ?? {}).map(p => p.item), ...v.weapons.filter(Boolean).map(w => w!.item)];
  return <div className="flex flex-wrap gap-1.5">{items.map(i => <GearIcon key={i.id} src={iconForItem(i)} size={40} exotic={i.exotic} title={i.name} mw={i.masterworked} />)}</div>;
}
function Stats({ v }: { v: BuildView }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {STAT_ORDER.map(k => (
        <div key={k} className={cn("rounded-lg border p-2 text-center", v.stats[k] >= 100 ? "border-accent-hi/50 bg-accent/20" : "border-line bg-panel-2")}>
          <div className="text-[11px] text-ink-dim">{STAT_LABEL[k]}</div>
          <div className="font-display text-lg tabular-nums">{v.stats[k]}</div>
        </div>
      ))}
    </div>
  );
}
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
function Research({ v }: { v: BuildView }) {
  const parts = [...v.coreParts.map(p => p.k), ...v.perkParts.map(p => p.k), ...v.weapons.flatMap(w => (w ? w.ks : []))];
  const srcs = [...new Map(parts.filter(k => k.src).map(k => [k.name, k.src!])).entries()];
  const combos = v.loops.combos.filter(c => c.src).map(c => [c.name, c.src!] as [string, string]);
  const all = [...combos, ...srcs].slice(0, 10);
  if (!all.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold">The research behind it</summary>
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
          <p className="text-sm text-ink-dim">Ready tonight. Everything is on your characters or in your vault.</p>
        </div>
        <Badge tone={r.confidence === "Proven" ? "good" : r.confidence === "Mostly proven" ? "neutral" : "warn"}>{r.confidence}</Badge>
      </div>
      <Pieces v={v} />
      <Stats v={v} />
      <Loadout v={v} />
      {r.why.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-semibold">How it plays</div>
          {r.why.map(w => <p key={w.name} className="text-sm"><span className="font-medium">{w.name}:</span> <span className="text-ink-dim">{w.play}</span></p>)}
        </div>
      )}
      {r.cost.length > 0 && <p className="text-sm"><span className="font-semibold">Before you equip:</span> <span className="text-ink-dim">{r.cost.join("; ")}</span></p>}
      <p className="text-sm text-ink-dim">{r.confidenceWhy}.</p>
      <Research v={v} />
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
        <p className="text-sm text-ink-dim">{p.sameCore ? "Nothing you're missing beats this build, so the biggest monster is this one with everything perfected." : "This uses gear you don't have yet. The steps below get you there."}</p>
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
