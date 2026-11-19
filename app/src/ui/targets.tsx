import { STAT_LABEL, STAT_ORDER, type StatKey } from "../bungie/config";
import type { StatTargets } from "../engine/builds";
import { cn } from "./kit";

// One clear control for stats, in the game's order: for each stat, "Auto" (Steeped decides, at least 50),
// a minimum, or "100+" (must stay at 100 or more). Saved in this browser so Builder and Workshop agree.
const KEY = "steeped-stat-targets";
export const loadTargets = (): StatTargets => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as StatTargets; } catch { return {}; } };
export const saveTargets = (t: StatTargets) => { try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* storage unavailable */ } };

const CHOICES: { v: number | undefined; label: string }[] = [
  { v: undefined, label: "Auto" }, { v: 0, label: "Any" }, { v: 60, label: "60+" }, { v: 70, label: "70+" }, { v: 80, label: "80+" }, { v: 90, label: "90+" }, { v: 100, label: "100+" },
];

export function StatTargetsBar({ targets, onChange, stats }: { targets: StatTargets; onChange: (t: StatTargets) => void; stats?: Partial<Record<StatKey, number>> }) {
  const set = (k: StatKey, v: number | undefined) => { const n = { ...targets }; if (v === undefined) delete n[k]; else n[k] = v; saveTargets(n); onChange(n); };
  const n100 = STAT_ORDER.filter(k => (targets[k] ?? 0) >= 100).length;
  return (
    <div className="space-y-1.5" data-testid="stat-targets">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-ink-dim">Stat targets</span>
        <span className="text-xs text-ink-dim">Auto = Steeped decides and aims for at least 50. A number is your minimum. 100+ = must stay at 100 or more.{n100 > 0 ? ` Keeping ${n100} at 100+.` : ""}</span>
        {Object.keys(targets).length > 0 && <button type="button" className="text-xs text-ink-dim underline hover:text-ink" onClick={() => { saveTargets({}); onChange({}); }}>Reset to Auto</button>}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STAT_ORDER.map(k => {
          const v = targets[k], short = stats && v !== undefined && v > 0 && (stats[k] ?? 0) < v;
          return (
            <label key={k} className={cn("flex flex-col gap-1 rounded-md border border-line px-2 py-1.5 text-xs", (v ?? 0) >= 100 && "border-accent bg-accent/15", short && "border-warn")}>
              <span className="flex justify-between"><span className="text-ink">{STAT_LABEL[k]}</span>{stats && <span className={cn("font-semibold", (stats[k] ?? 0) >= 100 ? "text-good" : short ? "text-warn" : "text-ink-dim")}>{stats[k]}</span>}</span>
              <select aria-label={`${STAT_LABEL[k]} target`} className="h-8 rounded border border-line bg-panel-2 px-1 text-sm text-ink"
                value={v === undefined ? "auto" : String(v)} onChange={e => set(k, e.target.value === "auto" ? undefined : Number(e.target.value))}>
                {CHOICES.map(c => <option key={c.label} value={c.v === undefined ? "auto" : String(c.v)}>{c.label}</option>)}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
