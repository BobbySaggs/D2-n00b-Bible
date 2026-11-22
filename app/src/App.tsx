import { useCallback, useEffect, useState } from "react";
import { finishSignIn, getToken, signOut } from "./bungie/auth";
import { BungieError } from "./bungie/api";
import { loadEverything, makeSnapshot, type LoadResult } from "./bungie/load";
import { downloadSnapshot } from "./snapshot";
import { SignIn } from "./screens/SignIn";
import { Roster } from "./screens/Roster";
import { Builder } from "./screens/Builder";
import { Workshop, type Sent } from "./screens/Workshop";
import { Path } from "./screens/Path";
import { Home } from "./screens/Home";
import { Inventory } from "./screens/Inventory";
import { Segmented } from "./ui/bits";
import { Button, Card, Logo } from "./ui/kit";

type Screen = "home" | "inventory" | "builder" | "workshop" | "path" | "roster";
const ADVANCED: Screen[] = ["builder", "workshop", "path", "roster"];

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
  const [now, setNow] = useState(Date.now());
  // A link can open a screen directly (…/beta/#builder).
  const [screen, setScreen] = useState<Screen>(() => { const h = location.hash.slice(1) as Screen; return (["home", "inventory", ...ADVANCED] as Screen[]).includes(h) ? h : "home"; });
  const [sent, setSent] = useState<Sent | null>(null); // a Workshop build on its way to a Builder column
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i); }, []);

  const load = useCallback(async () => {
    if (!getToken()) { setSt({ at: "signedOut" }); return; }
    setSt({ at: "loading", msg: "Connecting to Bungie" });
    try {
      const data = await loadEverything(msg => setSt({ at: "loading", msg }));
      setSt({ at: "ready", data });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      setSt(e instanceof BungieError && e.signedOut ? { at: "signedOut", error: err } : { at: "error", error: err });
    }
  }, []);

  useEffect(() => {
    signInOnce ??= finishSignIn();
    signInOnce.then(load, e => setSt({ at: "signedOut", error: e instanceof Error ? e.message : String(e) }));
  }, [load]);

  if (st.at === "start") return null;
  if (st.at === "signedOut") return <SignIn error={st.error} />;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="font-display text-2xl font-semibold leading-none">Steeped</div>
            {st.at === "ready" && <div className="text-xs text-ink-dim">{st.data.inventory.account.name}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        <Card className="flex items-center gap-3"><span className="size-3 animate-pulse rounded-full bg-accent-hi" />{st.msg}…</Card>
      )}
      {st.at === "error" && (
        <Card className="space-y-3 border-bad/40">
          <p className="text-bad">{st.error}</p>
          <Button size="sm" onClick={load}>Try again</Button>
        </Card>
      )}
      {st.at === "ready" && (
        <nav className="mb-5 flex flex-wrap items-center gap-3">
          <Segmented label="Screen" value={ADVANCED.includes(screen) ? "advanced" : screen} onChange={v => setScreen(v === "advanced" ? "builder" : v)}
            options={[{ value: "home", label: "Home" }, { value: "inventory", label: "Inventory" }, { value: "advanced", label: "Advanced" }]} />
          {ADVANCED.includes(screen) && (
            <Segmented label="Advanced tools" value={screen} onChange={setScreen}
              options={[{ value: "builder", label: "Builder" }, { value: "workshop", label: "Workshop" }, { value: "path", label: "Campaigns" }, { value: "roster", label: "My roster" }]} />
          )}
        </nav>
      )}
      {st.at === "ready" && screen === "home" && <Home inv={st.data.inventory} catalog={st.data.catalog ?? []} onInventory={() => setScreen("inventory")} onOpen={spec => { setSent({ col: 0, spec }); setScreen("builder"); }} />}
      {st.at === "ready" && screen === "inventory" && <Inventory inv={st.data.inventory} />}
      {st.at === "ready" && screen === "builder" && <Builder inv={st.data.inventory} onRefresh={load} incoming={sent} onIncomingUsed={() => setSent(null)} />}
      {st.at === "ready" && screen === "path" && <Path inv={st.data.inventory} quests={st.data.quests ?? []} />}
      {st.at === "ready" && screen === "workshop" && <Workshop inv={st.data.inventory} onSend={x => { setSent(x); setScreen("builder"); }} />}
      {st.at === "ready" && screen === "roster" && (
        <Roster
          inv={st.data.inventory}
          onExport={async () => {
            const { file, bytes } = await downloadSnapshot(makeSnapshot(st.data), `steeped-snapshot-${new Date().toISOString().slice(0, 10)}`);
            return `Saved ${file} (${(bytes / 1048576).toFixed(1)} MB). Upload it to Claude.`;
          }}
        />
      )}
      <footer className="mt-10 text-center text-xs text-ink-dim">Steeped beta {__APP_VERSION__}</footer>
    </div>
  );
}
