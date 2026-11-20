import { useMemo, useState } from "react";
import type { Inventory } from "../model/inventory";
import { CAMPAIGNS, REMOVED_CAMPAIGNS, type Campaign } from "../knowledge/campaigns";
import { loadStory, normMission, scanStory, type Quest, type StoryHistory } from "../bungie/quests";
import { Badge, Button, Card, cn } from "../ui/kit";
import { Spinner } from "../ui/bits";

// Your path: where you are in every campaign (live quest step from Bungie plus your story history), what to do
// next, and the other quests you're carrying.

const OVERRIDE_KEY = "steeped-campaign-override";
type Override = Record<string, "done" | "todo">;
const readOverride = (): Override => { try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? "{}"); } catch { return {}; } };
const writeOverride = (o: Override) => { try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o)); } catch { /* storage unavailable */ } };
const yt = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

interface Status { state: "done" | "partial" | "todo"; done: string[]; next?: string; source: "history" | "you" | "none" }
function statusOf(c: Campaign, story: StoryHistory | null, ov: Override): Status {
  const done = story ? c.missions.filter(m => story.missions[normMission(m)]) : [];
  const last = c.missions[c.missions.length - 1];
  let state: Status["state"] = !done.length ? "todo" : done.length >= Math.ceil(c.missions.length * 0.8) || done.includes(last) ? "done" : "partial";
  let source: Status["source"] = story ? "history" : "none";
  if (ov[c.id]) { state = ov[c.id] === "done" ? "done" : "todo"; source = "you"; }
  return { state, done, next: c.missions.find(m => !done.includes(m)), source };
}

function questFor(c: Campaign, quests: Quest[], cid: string): Quest | undefined {
  const mine = quests.filter(q => q.characterId === cid);
  const pool = mine.length ? mine : quests;
  const hits = pool.filter(q => c.keys.test(`${q.line} ${q.name}`) || c.missions.some(m => `${q.description} ${q.objectives.map(o => o.text).join(" ")}`.toLowerCase().includes(m.toLowerCase())));
  return hits.sort((a, b) => Number(c.keys.test(b.line)) - Number(c.keys.test(a.line)))[0];
}

export function Path({ inv, quests }: { inv: Inventory; quests: Quest[] }) {
  const hunter = inv.characters.find(c => c.cls === "Hunter") ?? inv.characters[0];
  const [story, setStory] = useState<StoryHistory | null>(loadStory);
  const [ov, setOv] = useState<Override>(readOverride);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => CAMPAIGNS.map(c => ({ c, s: statusOf(c, story, ov), q: questFor(c, quests, hunter?.id ?? "") })), [story, ov, quests, hunter]);
  const left = rows.filter(r => r.s.state !== "done"), done = rows.filter(r => r.s.state === "done");
  const openId = open ?? (left.find(r => r.q) ?? left[0])?.c.id ?? "";
  const campaignQuests = new Set(rows.map(r => r.q).filter(Boolean));
  const others = quests.filter(q => q.characterId === hunter?.id && !campaignQuests.has(q) && /quest|exotic/i.test(`${q.type} ${q.line}`));

  const scan = async () => {
    setBusy("Reading your story history"); setErr("");
    try { setStory(await scanStory(inv.account, inv.characters.map(c => c.id), setBusy)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(""); }
  };
  const mark = (id: string, v?: "done" | "todo") => { const n = { ...ov }; if (v) n[id] = v; else delete n[id]; writeOverride(n); setOv(n); };

  return (
    <div className="space-y-5" data-testid="path">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl">Your path</h2>
          <p className="text-sm text-ink-dim">{done.length} of {CAMPAIGNS.length} campaigns done. {left.length ? `Next up: ${left[0].c.name}.` : "Every campaign done."}</p>
          <p className="text-xs text-ink-dim">{story ? `Story history read ${new Date(story.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.` : "Read your story history once so Steeped can tick off missions you've finished."} Quests and their steps are live from Bungie.</p>
        </div>
        <Button onClick={scan} disabled={!!busy}>{story ? "Read story history again" : "Read my story history"}</Button>
      </Card>
      {busy && <Card><Spinner label={busy} /></Card>}
      {err && <Card className="border-bad/40 text-bad">{err}</Card>}

      {left.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-lg">Finish your campaigns</h3>
          {left.map(({ c, s, q }) => (
            <CampaignCard key={c.id} c={c} s={s} q={q} open={openId === c.id} onToggle={() => setOpen(openId === c.id ? "" : c.id)} onMark={v => mark(c.id, v)} hasStory={!!story} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <Card className="space-y-1 p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-accent-hi">Done</div>
          <ul className="space-y-1 text-sm">
            {done.map(({ c, s }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2"><span className="text-good">✓</span><b>{c.name}</b><span className="text-xs text-ink-dim">Unlocked: {c.unlocks.split(".")[0]}</span>
                {s.source === "you" && <><Badge>marked by you</Badge><button className="text-xs underline text-ink-dim" onClick={() => mark(c.id)}>undo</button></>}</li>
            ))}
          </ul>
        </Card>
      )}

      {others.length > 0 && (
        <details className="rounded-md border border-line p-3" data-testid="other-quests">
          <summary className="cursor-pointer font-display text-base">Other quests on your Hunter ({others.length})</summary>
          <ul className="mt-2 space-y-1.5 text-sm">
            {others.slice(0, 40).map(q => { const o = q.objectives.find(x => !x.done); return (
              <li key={`${q.hash}`}><b>{q.line || q.name}</b><div className="text-xs text-ink-dim">{q.line && q.line !== q.name ? `${q.name}: ` : ""}{o ? `${o.text}${o.goal > 1 ? ` (${o.progress} / ${o.goal})` : ""}` : q.description.slice(0, 160)}</div></li>
            ); })}
          </ul>
        </details>
      )}
      <p className="text-xs text-ink-dim">Mission lists come from Claude's research (Nov 2026). {REMOVED_CAMPAIGNS.join(", ")} were removed from the game and aren't playable.</p>
    </div>
  );
}

function CampaignCard({ c, s, q, open, onToggle, onMark, hasStory }: { c: Campaign; s: Status; q?: Quest; open: boolean; onToggle: () => void; onMark: (v?: "done" | "todo") => void; hasStory: boolean }) {
  const step = q?.objectives.find(o => !o.done);
  return (
    <Card className={cn("p-0", open && "ring-1 ring-accent/50")} data-testid={`camp-${c.id}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left">
        <span>
          <b className="font-display text-base">{c.name}</b>
          <span className="block text-xs text-ink-dim">{hasStory ? `${s.done.length} of ${c.missions.length} missions done` : `${c.missions.length} missions`}{s.next && hasStory ? ` · next: ${s.next}` : ""}</span>
        </span>
        <span className="flex items-center gap-2">
          <Badge tone={q ? "good" : s.state === "partial" ? "warn" : "neutral"}>{q ? "Quest found" : s.state === "partial" ? "Started" : "Not started"}</Badge>
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line p-3 text-sm">
          {q ? (
            <div className="space-y-1.5 rounded-md bg-good/10 p-3" data-testid="you-are-here">
              <div className="text-xs font-semibold uppercase tracking-wider text-good">You're here</div>
              <b>{q.name}{q.steps > 1 && q.step >= 0 ? <span className="text-xs text-ink-dim"> (step {q.step + 1} of {q.steps})</span> : null}</b>
              {q.description && <p><b className="text-good">Do this next:</b> {q.description}</p>}
              {q.objectives.length > 0 && (
                <ul className="space-y-1">
                  {q.objectives.map((o, i) => (
                    <li key={i} className={cn("flex items-center gap-2 text-xs", o.done && "text-ink-dim line-through")}>
                      <span>{o.done ? "✓" : "○"}</span><span className="flex-1">{o.text || "Objective"}</span>
                      {o.goal > 1 && <><span className="h-1.5 w-24 overflow-hidden rounded bg-line"><span className="block h-full bg-good" style={{ width: `${Math.min(100, Math.round((100 * o.progress) / o.goal))}%` }} /></span><b>{o.progress} / {o.goal}</b></>}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-dim">In game: open Quests, find {q.line || q.name}, and press Track. Its waypoint then shows on your map.{step ? "" : " Every objective on this step is done; turn it in or play the next mission."}</p>
            </div>
          ) : (
            <div className="space-y-1.5 rounded-md bg-warn/10 p-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-warn">Can't find your quest</div>
              <b>The {c.name} quest isn't on your Hunter</b>
              <p className="text-xs text-ink-dim">That's why nothing happens when you talk to the character who gives it. To get it back:</p>
              <ol className="list-decimal space-y-0.5 pl-5">{c.start.map(t => <li key={t}>{t}</li>)}</ol>
              <p className="text-xs text-ink-dim">Then refresh Steeped and this card shows your exact step.</p>
            </div>
          )}
          <div>
            <div className="text-xs text-ink-dim">Missions in order</div>
            <ol className="mt-1 space-y-0.5">
              {c.missions.map(m => {
                const isDone = s.done.includes(m), isNext = m === s.next && hasStory;
                return (
                  <li key={m} className={cn("flex flex-wrap items-center gap-2", isDone && "text-ink-dim", isNext && "font-semibold text-ink")}>
                    <span>{isDone ? "✓" : isNext ? "▶" : "○"} {m}</span>
                    {isNext && <a className="text-xs text-accent-hi underline" href={yt(`${c.name} ${m} walkthrough`)} target="_blank" rel="noopener">Video walkthrough</a>}
                  </li>
                );
              })}
            </ol>
          </div>
          <p className="text-xs text-ink-dim">Starts at: {c.where} Unlocks: {c.unlocks} Campaigns are solo friendly on any difficulty.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => onMark("done")}>I've finished this</Button>
            {s.source === "you" && <Button size="sm" variant="quiet" onClick={() => onMark()}>Use my story history instead</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}
