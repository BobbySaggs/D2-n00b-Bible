import { useCallback, useEffect, useState } from "react";
import { finishSignIn, getToken, signOut } from "./bungie/auth";
import { BungieError } from "./bungie/api";
import { extendCatalog } from "./bungie/catalog";
import { fromSnapshot, loadEverything, makeSnapshot, type LoadResult } from "./bungie/load";
import { downloadSnapshot } from "./snapshot";
import { SignIn } from "./screens/SignIn";
import { Roster } from "./screens/Roster";
import { Builder } from "./screens/Builder";
import { Workshop, type Sent } from "./screens/Workshop";
import { Home } from "./screens/Home";
import { CLARITY_DISCORD, CLARITY_ON, CLARITY_SITE } from "./bungie/clarity";
import { Inventory } from "./screens/Inventory";
import { Journey } from "./screens/Journey";
import { Segmented } from "./ui/bits";
import { Button, Card } from "./ui/kit";
import { BRAND, Moment } from "./ui/visual";
import { pickCharacter, setCharacterClass, supportedCharacters, useCharacterClass } from "./ui/character";

type Screen = "home" | "builds" | "journey" | "inventory" | "workshop" | "roster";
const ADVANCED: Screen[] = ["workshop", "roster"];

type State =
  | { at: "start" }
  | { at: "signedOut"; error?: string }
  | { at: "loading"; msg: string }
  | { at: "ready"; data: LoadResult }
  | { at: "error"; error: string };

// The sign-in code can only be traded once, even though React runs effects twice in development.
let signInOnce: Promise<boolean> | null = null;

function ago(t: number, now: number) {
  const m = Math.floor((now - t) / 60000);
  return m < 1 ? "just now" : m === 1 ? "1 min ago" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

export default function App() {
  const [st, setSt] = useState<State>({ at: "start" });
  const [bg, setBg] = useState(""); // background work, such as reading every legendary weapon
  const [now, setNow] = useState(Date.now());
  // A link can open a screen directly (…/beta/#builder).
  const [screen, setScreen] = useState<Screen>(() => { const h = location.hash.slice(1) as Screen; const alias: Record<string, Screen> = { path: "journey", builder: "builds" }; const s = alias[h] ?? h; return (["home", "builds", "journey", "inventory", ...ADVANCED] as string[]).includes(s) ? s : "home"; });
  const [sent, setSent] = useState<Sent | null>(null); // a Workshop build on its way to a Builder column
  const chosenCls = useCharacterClass();
  const me = st.at === "ready" ? pickCharacter(st.data.inventory, chosenCls) : undefined;
  const cid = me?.id ?? "none"; // screens restart when you switch character
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);

  const load = useCallback(async () => {
    if (!getToken()) { setSt({ at: "signedOut" }); return; }
    setSt({ at: "loading", msg: "Connecting to Bungie" });
    try {
      const data = await loadEverything(msg => setSt({ at: "loading", msg }));
      setSt({ at: "ready", data });
      // Every legendary weapon that can drop today, for "Best possible". Loads behind the scenes, once per Destiny update.
      extendCatalog(data.raw, msg => setBg(msg)).then(full => {
        setBg("");
        if (full) setSt(s => (s.at === "ready" && s.data === data ? { at: "ready", data: { ...data, catalog: full } } : s));
      }, () => setBg(""));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setSt(e instanceof BungieError && e.signedOut ? { at: "signedOut", error: err } : { at: "error", error: err });
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has("snap")) {
      fetch("/dev/snap.json").then(r => r.json()).then(s => setSt({ at: "ready", data: fromSnapshot(s) }), e => setSt({ at: "error", error: String(e) }));
      return;
    }
    signInOnce ??= finishSignIn();
    signInOnce.then(load, e => setSt({ at: "signedOut", error: e instanceof Error ? e.message : String(e) }));
  }, [load]);

  if (st.at === "start") return null;
  if (st.at === "signedOut") return <SignIn error={st.error} />;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-3">
          <img src={BRAND.emblemSmall} alt="Steeped" className="h-16 w-auto drop-shadow-[0_6px_14px_rgb(123_63_242/0.5)]" />
          {st.at === "ready" && <div className="text-sm text-ink-dim">{st.data.inventory.account.name}</div>}
        </div>
        <div className="flex items-center gap-2">
          {st.at === "ready" && bg && <span data-testid="bg-work" className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs text-accent-hi"><span className="size-2 animate-pulse rounded-full bg-accent-hi" />{bg}</span>}
          {st.at === "ready" && (
            <span data-testid="live-badge" className="inline-flex items-center gap-2 rounded-full bg-good/12 px-3 py-1 text-xs text-good">
              <span className="size-2 rounded-full bg-good" /> Live from Bungie, updated {ago(st.data.inventory.loadedAt, now)}
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={load} disabled={st.at === "loading"}>Refresh</Button>
          <Button size="sm" variant="quiet" onClick={() => { signOut(); setSt({ at: "signedOut" }); }}>Sign out</Button>
        </div>
      </header>

      {st.at === "loading" && (
        <Moment pose="mug" title="Brewing…">{st.msg}…</Moment>
      )}
      {st.at === "error" && (
        <Card className="space-y-3 border-bad/40">
          <p className="text-bad">{st.error}</p>
          <Button size="sm" onClick={load}>Try again</Button>
        </Card>
      )}
      {st.at === "ready" && (
        <nav className="mb-5 flex flex-wrap items-center gap-3">
          <Segmented label="Screen" value={ADVANCED.includes(screen) ? "home" : screen} onChange={setScreen}
            options={[{ value: "home", label: "Home" }, { value: "builds", label: "Builds" }, { value: "journey", label: "Journey" }, { value: "inventory", label: "Inventory" }]} />
          {ADVANCED.includes(screen) && <span className="text-sm text-ink-dim">{screen === "workshop" ? "Workshop" : "My roster"}</span>}
          {supportedCharacters(st.data.inventory).length > 1 && me && (
            <div className="ml-auto" data-testid="character-switch">
              <Segmented label="Character" value={me.cls} onChange={setCharacterClass}
                options={supportedCharacters(st.data.inventory).map(c => ({ value: c.cls, label: `${c.cls} ${Math.floor(c.light)}` }))} />
            </div>
          )}
        </nav>
      )}
      {st.at === "ready" && screen === "home" && <Home key={cid} inv={st.data.inventory} catalog={st.data.catalog ?? []} onGo={setScreen} onRefresh={load} onOpen={spec => { setSent({ col: 0, spec }); setScreen("builds"); }} />}
      {st.at === "ready" && screen === "journey" && <Journey key={cid} inv={st.data.inventory} catalog={st.data.catalog ?? []} catalysts={st.data.catalysts ?? []} artifact={st.data.artifact} quests={st.data.quests ?? []} />}
      {st.at === "ready" && screen === "inventory" && <Inventory key={cid} inv={st.data.inventory} />}
      {st.at === "ready" && screen === "builds" && <Builder key={cid} inv={st.data.inventory} catalog={st.data.catalog ?? []} onRefresh={load} incoming={sent} onIncomingUsed={() => setSent(null)} />}
            {st.at === "ready" && screen === "workshop" && <Workshop key={cid} inv={st.data.inventory} onSend={x => { setSent(x); setScreen("builds"); }} />}
      {st.at === "ready" && screen === "roster" && (
        <Roster
          inv={st.data.inventory}
          onExport={async () => {
            const { file, bytes } = await downloadSnapshot(makeSnapshot(st.data), `steeped-snapshot-${new Date().toISOString().slice(0, 10)}`);
            return `Saved ${file} (${(bytes / 1048576).toFixed(1)} MB). Upload it to Claude.`;
          }}
        />
      )}
      <footer className="mt-10 space-y-1 text-center text-xs text-ink-dim">
        {CLARITY_ON && <div>Perk values from <a href={CLARITY_SITE} target="_blank" rel="noreferrer">Clarity</a>{CLARITY_DISCORD && <> · <a href={CLARITY_DISCORD} target="_blank" rel="noreferrer">Clarity Discord</a></>}</div>}
        {st.at === "ready" && <div className="space-x-3"><button type="button" className="hover:text-ink" onClick={() => setScreen("workshop")}>Workshop</button><button type="button" className="hover:text-ink" onClick={() => setScreen("roster")}>My roster and snapshot</button></div>}
        <div>Steeped beta {__APP_VERSION__} · © Bobby Saggs. All rights reserved. Not affiliated with Bungie.</div>
      </footer>
    </div>
  );
}
