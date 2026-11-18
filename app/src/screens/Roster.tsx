import { useMemo, useState } from "react";
import { Badge, Button, Card, Stat } from "../ui/kit";
import { STAT_LABEL, STAT_ORDER } from "../bungie/config";
import type { Inventory } from "../model/inventory";
import { summarize } from "../model/summary";

// Phase 1 screen: proof that Steeped sees exactly what the game shows.
export function Roster({ inv, onExport }: { inv: Inventory; onExport: () => Promise<string> }) {
  const s = useMemo(() => summarize(inv), [inv]);
  const [exportMsg, setExportMsg] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><Stat label="Vault" value={s.vault} hint="items in your vault" /></Card>
        <Card><Stat label="On characters" value={s.itemsOnCharacters} hint="weapons and armor" /></Card>
        <Card><Stat label="Weapons" value={s.weapons} hint={`${s.exoticWeapons.length} exotic`} /></Card>
        <Card><Stat label="Characters" value={inv.characters.length} /></Card>
      </section>

      {s.classes.map(c => (
        <Card key={c.cls} className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-2xl">{c.cls}</h2>
            {c.character && <span className="font-display text-xl text-exotic">✦ {c.character.light}</span>}
          </div>
          {c.character && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {STAT_ORDER.map(k => (
                <div key={k} className="rounded-xl bg-panel-2 p-3 text-center">
                  <div className="text-xs text-ink-dim">{STAT_LABEL[k]}</div>
                  <div className={`font-display text-xl ${c.character!.stats[k] >= 100 ? "text-good" : ""}`}>{c.character!.stats[k]}</div>
                </div>
              ))}
            </div>
          )}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-ink-dim">Subclass</dt><dd>{c.subclass ?? "Not equipped"}</dd></div>
            <div><dt className="text-ink-dim">Exotic armor worn</dt><dd>{c.wornExotic ?? "None"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-dim">Weapons worn</dt><dd>{c.wornWeapons.join(", ") || "None"}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Badge>{c.armor} armor {c.armor === 1 ? "piece" : "pieces"}</Badge>
            <Badge tone="good">{c.tier5} Tier 5</Badge>
            <Badge tone="exotic">{c.exotics.length} exotic armor</Badge>
          </div>
          {c.exotics.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-dim">Exotic armor you own</summary>
              <p className="mt-2 leading-relaxed">{c.exotics.join(" · ")}</p>
            </details>
          )}
        </Card>
      ))}

      <Card className="space-y-3">
        <h2 className="text-xl">Does this match the game?</h2>
        <p className="text-sm text-ink-dim">
          Check Power, stats and what you're wearing against your character screen. Then save a snapshot and send it to Claude, so every
          build gets tested on your real gear before you see it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={busy} onClick={async () => { setBusy(true); try { setExportMsg(await onExport()); } finally { setBusy(false); } }}>
            {busy ? "Saving…" : "Export snapshot for Claude"}
          </Button>
          {exportMsg && <span className="text-sm text-good">{exportMsg}</span>}
        </div>
      </Card>
    </div>
  );
}
