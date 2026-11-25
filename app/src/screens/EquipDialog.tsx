import { useMemo, useState } from "react";
import { equipItems, insertPlug, plain, sleep, snapshotLoadout, transfer, type Who } from "../bungie/actions";
import type { LoadoutSlot } from "../model/inventory";
import type { EquipStep } from "../engine/equip";
import { Button, Card, cn } from "../ui/kit";

type Status = { state: "waiting" | "working" | "done" | "failed" | "manual"; note?: string };

// Runs an equip plan step by step against Bungie and shows every result. Nothing happens until you press Start.
export function EquipDialog({ title, steps, who, onClose, onDone, onStart, intro, slots }: { title: string; steps: EquipStep[]; who: Who; onClose: () => void; onDone: () => void; onStart?: () => void; intro?: string; slots?: LoadoutSlot[] }) {
  const [saveTo, setSaveTo] = useState(-1); // in-game loadout slot to save into afterwards (-1 = don't)
  const [saved, setSaved] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<Status[]>(() => steps.map(s => ({ state: s.kind === "manual" ? "manual" : "waiting", note: s.kind === "manual" ? s.why : undefined })));
  const [phase, setPhase] = useState<"confirm" | "running" | "finished">("confirm");
  const [stopReason, setStopReason] = useState("");
  const set = (i: number, st: Status) => setStatus(s => { const n = [...s]; n[i] = st; return n; });

  const groups = useMemo(() => {
    const g: { name: string; idx: number[] }[] = [
      { name: "Bring gear to this character", idx: [] }, { name: "Equip", idx: [] }, { name: "Subclass", idx: [] }, { name: "Armor mods", idx: [] }, { name: "Artifact", idx: [] }, { name: "Weapon perks", idx: [] },
    ];
    steps.forEach((s, i) => {
      if (s.kind === "move") g[0].idx.push(i);
      else if (s.kind === "equip") g[1].idx.push(i);
      else if ((s.kind === "plug" || s.kind === "manual") && s.group === "subclass") g[2].idx.push(i);
      else if ((s.kind === "plug" || s.kind === "manual") && s.group === "artifact") g[4].idx.push(i);
      else if (s.kind === "plug" && s.group === "weapons") g[5].idx.push(i);
      else g[3].idx.push(i);
    });
    return g.filter(x => x.idx.length);
  }, [steps]);

  const run = async () => {
    onStart?.();
    setPhase("running");
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      if (s.kind === "manual") continue;
      set(i, { state: "working" });
      try {
        if (s.kind === "move") {
          if (s.via === "vault") await transfer(who, s.item.hash, s.item.id, true, s.item.owner);
          await transfer(who, s.item.hash, s.item.id, false, who.characterId);
          set(i, { state: "done" });
        } else if (s.kind === "equip") {
          const r = await equipItems(who, s.items.map(x => x.id));
          const bad = (r.equipResults ?? []).filter(x => x.equipStatus !== 1);
          if (bad.length) set(i, { state: "failed", note: `${bad.length} item(s) didn't equip. Equip them in game.` });
          else set(i, { state: "done" });
        } else {
          await insertPlug(who, s.item.id, s.socket, s.hash);
          set(i, { state: "done" });
          await sleep(250); // Bungie throttles socket changes; a short gap avoids most refusals.
        }
      } catch (e) {
        const msg = plain(e);
        set(i, { state: "failed", note: msg });
        // Wrong location or a lost sign-in means every later step fails the same way: stop and say so.
        if (/orbit or a social space|sign-in ran out/i.test(msg)) {
          setStopReason(msg);
          setStatus(st => st.map((x, j) => (j > i && x.state === "waiting" ? { state: "failed", note: "Not tried" } : x)));
          break;
        }
      }
    }
    if (saveTo >= 0 && slots?.[saveTo]) {
      try { await snapshotLoadout(who, saveTo, slots[saveTo]); setSaved({ ok: true, text: `Saved to in-game loadout slot ${saveTo + 1}.` }); }
      catch (e) { setSaved({ ok: false, text: `Couldn't save the loadout slot: ${plain(e)}` }); }
    }
    setPhase("finished");
  };

  const count = (k: Status["state"]) => status.filter(s => s.state === k).length;
  const todo = steps.map((s, i) => ({ s, st: status[i] })).filter(x => x.st.state === "failed" || x.st.state === "manual");

  return (
    <div role="dialog" aria-modal="true" aria-label={`Equip ${title}`} className="fixed inset-0 z-50 flex items-end justify-center bg-bg-deep/80 p-3 backdrop-blur-sm sm:items-center"
      onClick={e => { if (e.target === e.currentTarget && phase !== "running") onClose(); }}>
      <Card className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto bg-bg" data-testid="equip-dialog">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl">Equip {title}</h3>
            <p className="text-sm text-ink-dim">
              {phase === "confirm" && <>{intro ?? "This changes this character's gear, subclass and mods"}: {steps.filter(s => s.kind !== "manual").length} steps. Stand in orbit or a social space first.{!intro && " Steeped saves what you're wearing first, so you can undo this."}</>}
              {phase === "running" && "Working… keep the game where it is until this finishes."}
              {phase === "finished" && <span data-testid="equip-summary">{count("done")} done{count("failed") ? `, ${count("failed")} failed` : ""}{count("manual") ? `, ${count("manual")} to do in game` : ""}.</span>}
            </p>
          </div>
          {phase !== "running" && <Button size="sm" variant="ghost" onClick={onClose}>{phase === "finished" ? "Close" : "Cancel"}</Button>}
        </div>
        {stopReason && <p className="rounded-lg bg-warn/10 p-3 text-sm text-warn">{stopReason}</p>}

        {groups.map(g => (
          <div key={g.name} className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-accent-hi">{g.name}</h4>
            <ol className="space-y-1">
              {g.idx.map(i => (
                <li key={i} className="flex items-start justify-between gap-3 text-sm">
                  <span>{steps[i].label}{status[i].note && <span className="block text-xs text-ink-dim">{status[i].note}</span>}</span>
                  <StatusPill s={status[i]} />
                </li>
              ))}
            </ol>
          </div>
        ))}

        {phase === "finished" && todo.length > 0 && (
          <div className="space-y-1 rounded-lg border border-warn/40 p-3" data-testid="equip-todo">
            <h4 className="font-display text-base">Do these in game</h4>
            <ol className="list-decimal space-y-1 pl-5 text-sm">{todo.map(({ s, st }, n) => <li key={n}>{s.label}{st.note && <span className="text-ink-dim"> ({st.note})</span>}</li>)}</ol>
          </div>
        )}
        {phase === "confirm" && slots && slots.length > 0 && (
          <div className="space-y-1">
            <label htmlFor="save-slot" className="text-sm font-semibold">Also save it to an in-game loadout slot</label>
            <select id="save-slot" value={saveTo} onChange={e => setSaveTo(Number(e.target.value))} className="block w-full rounded-lg border border-line bg-panel-2 px-2 py-2 text-sm text-ink">
              <option value={-1}>Don't save</option>
              {slots.map(sl => <option key={sl.index} value={sl.index}>Slot {sl.index + 1}{sl.empty ? " (empty)" : " (replaces what's saved there)"}</option>)}
            </select>
            <p className="text-xs text-ink-dim">Then you can swap to it in game, for example at a boss, without opening Steeped.</p>
          </div>
        )}
        {saved && <p className={cn("text-sm", saved.ok ? "text-good" : "text-bad")} data-testid="loadout-saved">{saved.text}</p>}
        {phase === "confirm" && <Button className="w-full" onClick={run}>Start: equip in game</Button>}
        {phase === "finished" && <Button className="w-full" onClick={() => { onClose(); onDone(); }}>Close and refresh from Bungie</Button>}
      </Card>
    </div>
  );
}

function StatusPill({ s }: { s: Status }) {
  const map = { waiting: ["Waiting", "text-ink-dim"], working: ["Working…", "text-accent-hi"], done: ["Done", "text-good"], failed: ["Failed", "text-bad"], manual: ["In game", "text-warn"] } as const;
  const [t, c] = map[s.state];
  return <span className={cn("shrink-0 text-xs font-medium", c)}>{t}</span>;
}
