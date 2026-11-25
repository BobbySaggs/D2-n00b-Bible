import { useMemo, useState } from "react";
import { DEFS } from "../bungie/defs";
import { STAT_LABEL, STAT_ORDER } from "../bungie/config";
import { equipItems, plain, transfer, type Who } from "../bungie/actions";
import type { Inventory as Inv, Item } from "../model/inventory";
import { Badge, Button, Card, cn } from "../ui/kit";
import { Segmented } from "../ui/bits";
import { GearIcon, iconForItem } from "../ui/gear";
import { useCharacter } from "../ui/character";
import { cleanup, type Junk } from "../engine/cleanup";

// Your whole collection in one place: every character and the vault, with search, filters, item details,
// and move or equip actions. Every action asks first and shows what Bungie said.
type Kind = "all" | "weapon" | "armor";
type Action = { kind: "move"; to: string } | { kind: "equip"; on: string };

export function Inventory({ inv }: { inv: Inv }) {
  const hunter = useCharacter(inv);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [where, setWhere] = useState("all");
  const [cls, setCls] = useState<"mine" | "all">(hunter ? "mine" : "all");
  const [flags, setFlags] = useState({ exotic: false, infuse: false, t5: false, notMw: false, junk: false });
  const [sort, setSort] = useState<"power" | "tier" | "name">("power");
  const [open, setOpen] = useState<Item | null>(null);
  // Moves you made here, applied on top of the last load until the next refresh.
  const [moved, setMoved] = useState<Record<string, { owner: string; equipped: boolean }>>({});

  const items = useMemo(() => inv.items
    .filter(i => i.kind === "weapon" || i.kind === "armor")
    .map(i => (moved[i.id] ? { ...i, ...moved[i.id] } : i)), [inv, moved]);
  const light = hunter?.light ?? 0;
  // Safe to dismantle: duplicate rolls and armor beaten on every stat (see engine/cleanup.ts).
  const junk = useMemo(() => new Map<string, Junk>(cleanup(inv, h => DEFS.get(h)).map(j => [j.item.id, j])), [inv]);
  const ownerName = (o: string) => (o === "vault" ? "Vault" : inv.characters.find(c => c.id === o)?.cls ?? "Character");

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(i => {
      if (kind !== "all" && i.kind !== kind) return false;
      if (where !== "all" && i.owner !== where) return false;
      if (cls === "mine" && i.kind === "armor" && i.cls !== hunter?.cls && i.cls !== "Any") return false;
      if (flags.exotic && !i.exotic) return false;
      if (flags.infuse && !(i.power < light - 10)) return false;
      if (flags.t5 && i.gearTier < 5) return false;
      if (flags.notMw && (i.masterworked || i.exotic)) return false;
      if (flags.junk && !junk.has(i.id)) return false;
      if (!words.length) return true;
      const hay = [i.name, DEFS.get(i.hash)?.type ?? "", i.damage, ...i.plugs.map(h => DEFS.get(h)?.name ?? "")].join(" ").toLowerCase();
      return words.every(w => hay.includes(w));
    }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "tier" ? b.gearTier - a.gearTier || b.power - a.power : b.power - a.power);
  }, [items, q, kind, where, cls, flags, sort, light, junk]);

  const groups = useMemo(() => {
    const owners = [...inv.characters.map(c => c.id), "vault"];
    return owners.map(o => ({ owner: o, items: shown.filter(i => i.owner === o) })).filter(g => g.items.length);
  }, [shown, inv]);

  const flag = (k: keyof typeof flags, label: string) => (
    <button type="button" aria-pressed={flags[k]} onClick={() => setFlags(f => ({ ...f, [k]: !f[k] }))}
      className={cn("rounded-full border px-3 py-1.5 text-sm transition-colors", flags[k] ? "border-accent-hi/60 bg-accent/25 text-ink" : "border-line text-ink-dim hover:text-ink")}>{label}</button>
  );

  return (
    <div className="space-y-5" data-testid="inventory">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="inv-q" className="text-xs font-semibold text-ink-dim">Search</label>
            <input id="inv-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Name, type, element or perk (e.g. rocket incandescent)"
              className="mt-1 w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent-hi" />
          </div>
          <Segmented label="Kind" value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, { value: "weapon", label: "Weapons" }, { value: "armor", label: "Armor" }]} />
          <div>
            <label htmlFor="inv-where" className="text-xs font-semibold text-ink-dim">Where</label>
            <select id="inv-where" value={where} onChange={e => setWhere(e.target.value)} className="mt-1 block rounded-lg border border-line bg-panel-2 px-2 py-2 text-sm text-ink">
              <option value="all">Everywhere</option>
              {inv.characters.map(c => <option key={c.id} value={c.id}>{c.cls}</option>)}
              <option value="vault">Vault</option>
            </select>
          </div>
          <div>
            <label htmlFor="inv-sort" className="text-xs font-semibold text-ink-dim">Sort</label>
            <select id="inv-sort" value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="mt-1 block rounded-lg border border-line bg-panel-2 px-2 py-2 text-sm text-ink">
              <option value="power">Power</option><option value="tier">Tier</option><option value="name">Name</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={cls === "mine"} onClick={() => setCls(c => (c === "mine" ? "all" : "mine"))}
            className={cn("rounded-full border px-3 py-1.5 text-sm", cls === "mine" ? "border-accent-hi/60 bg-accent/25" : "border-line text-ink-dim")}>{hunter?.cls ?? "Hunter"} armor only</button>
          {flag("exotic", "Exotic")}
          {flag("t5", "Tier 5")}
          {flag("infuse", "Needs infusing")}
          {flag("notMw", "Not masterworked")}
          {flag("junk", `Safe to dismantle (${junk.size})`)}
          <span className="ml-auto text-sm text-ink-dim" data-testid="inv-count">{shown.length} items</span>
        </div>
      </Card>

      {groups.map(g => (
        <section key={g.owner} className="space-y-2">
          <h2 className="font-display text-lg font-semibold">{ownerName(g.owner)} <span className="text-sm font-normal text-ink-dim">{g.items.length}</span></h2>
          <div className="flex flex-wrap gap-2">
            {g.items.slice(0, 400).map(i => (
              <button key={i.id} type="button" onClick={() => setOpen(i)} aria-label={`${i.name}, Power ${i.power}`}
                className={cn("relative rounded-lg p-0.5 transition-transform hover:scale-105", i.equipped && "ring-2 ring-accent-hi")}>
                <GearIcon src={iconForItem(i)} size={52} exotic={i.exotic} title={i.name} mw={i.masterworked} element={i.damage} />
                <span className="absolute bottom-0.5 right-0.5 rounded bg-bg-deep/85 px-1 text-[10px] tabular-nums text-ink">{i.power}</span>
                {i.gearTier > 0 && <span className="absolute left-0.5 top-0.5 rounded bg-bg-deep/85 px-1 text-[10px] text-exotic">T{i.gearTier}</span>}
              </button>
            ))}
            {g.items.length > 400 && <p className="w-full text-sm text-ink-dim">Showing 400 of {g.items.length}. Search or filter to narrow it down.</p>}
          </div>
        </section>
      ))}
      {!groups.length && <Card className="text-ink-dim">Nothing matches. Try fewer filters.</Card>}

      {flags.junk && groups.length > 0 && (
        <p className="text-sm text-ink-dim">These duplicate a better copy you own, or are beaten on every stat by another piece of the same set. Locked and equipped items are never listed. Bungie doesn't let apps dismantle, so do it in game.</p>
      )}
      {open && <ItemPanel item={open} junk={junk.get(open.id)} inv={inv} light={light} ownerName={ownerName} onClose={() => setOpen(null)}
        onMoved={(id, owner, equipped, slotOf) => setMoved(m => {
          const n = { ...m, [id]: { owner, equipped } };
          // Equipping something unequips whatever was in that slot on that character.
          if (equipped) for (const x of items) if (x.id !== id && x.owner === owner && x.equipped && x.slot === slotOf) n[x.id] = { owner, equipped: false };
          return n;
        })} />}
    </div>
  );
}

function ItemPanel({ item, junk, inv, light, ownerName, onClose, onMoved }: {
  item: Item; junk?: Junk; inv: Inv; light: number; ownerName: (o: string) => string; onClose: () => void;
  onMoved: (id: string, owner: string, equipped: boolean, slot: string | null) => void;
}) {
  const d = DEFS.get(item.hash);
  const [ask, setAsk] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canWear = (cid: string) => item.kind === "weapon" || item.cls === "Any" || inv.characters.find(c => c.id === cid)?.cls === item.cls;

  const perks = item.kind === "weapon" ? item.plugs.map((h, i) => ({ i, d: DEFS.get(h) }))
    .filter(x => x.d && ["frames", "origins", "intrinsics", "barrels", "magazines"].includes(x.d.plugCat)) : [];

  const run = async (a: Action) => {
    setBusy(true); setMsg(null);
    const mt = inv.account.membershipType;
    try {
      const target = a.kind === "move" ? a.to : a.on;
      if (item.owner !== target) {
        if (item.equipped) throw new Error("It's equipped. Equip something else in that slot first (in game or here), then move it.");
        if (item.owner !== "vault") await transfer({ membershipType: mt, characterId: item.owner }, item.hash, item.id, true, item.owner);
        if (target !== "vault") await transfer({ membershipType: mt, characterId: target }, item.hash, item.id, false, target);
      }
      if (a.kind === "equip") {
        const r = await equipItems({ membershipType: mt, characterId: a.on } satisfies Who, [item.id]);
        if ((r.equipResults ?? []).some(x => x.equipStatus !== 1)) throw new Error("Bungie moved it but didn't equip it. Equip it in game (an exotic of the same kind may already be on).");
        onMoved(item.id, a.on, true, item.slot);
        setMsg({ ok: true, text: `Equipped on your ${ownerName(a.on)}.` });
      } else {
        onMoved(item.id, a.to, false, item.slot);
        setMsg({ ok: true, text: `Moved to ${a.to === "vault" ? "your vault" : `your ${ownerName(a.to)}`}.` });
      }
    } catch (e) {
      setMsg({ ok: false, text: plain(e) });
    } finally { setBusy(false); setAsk(null); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={item.name} className="fixed inset-0 z-50 flex items-end justify-center bg-bg-deep/80 p-3 backdrop-blur-sm sm:items-center"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <Card className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto bg-bg" data-testid="item-panel">
        <div className="flex items-start gap-3">
          <GearIcon src={iconForItem(item)} size={64} exotic={item.exotic} mw={item.masterworked} element={item.damage} />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-semibold">{item.name}</h3>
            <div className="text-sm text-ink-dim">{d?.type}{item.damage ? ` · ${item.damage}` : ""} · {ownerName(item.owner)}{item.equipped ? " (equipped)" : ""}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge>Power {item.power}</Badge>
              {item.gearTier > 0 && <Badge tone="exotic">Tier {item.gearTier}</Badge>}
              {item.exotic && <Badge tone="exotic">Exotic</Badge>}
              {item.masterworked && <Badge tone="good">Masterworked</Badge>}
              {item.power < light - 10 && <Badge tone="warn">Infuse to use (you're {light})</Badge>}
              {item.locked && <Badge>Locked</Badge>}
            </div>
          </div>
          <Button size="sm" variant="quiet" onClick={onClose} disabled={busy} aria-label="Close">Close</Button>
        </div>

        {junk && <p className="rounded-xl bg-warn/10 p-3 text-sm text-warn" data-testid="junk-reason">Safe to dismantle: {junk.reason}.</p>}
        {item.kind === "armor" && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {STAT_ORDER.map(k => (
              <div key={k} className="rounded-lg bg-panel-2 p-2 text-center">
                <div className="text-[11px] text-ink-dim">{STAT_LABEL[k]}</div>
                <div className="font-display text-lg tabular-nums">{item.stats[k]}</div>
              </div>
            ))}
          </div>
        )}
        {perks.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Perks</div>
            {perks.map(({ i, d: p }) => {
              const alts = (item.reusable[i] ?? []).filter(h => h !== item.plugs[i]).map(h => DEFS.get(h)?.name).filter(Boolean);
              return (
                <div key={i} className="text-sm">
                  <span className="font-medium">{p!.name}</span>
                  {alts.length > 0 && <span className="text-ink-dim"> (can switch to {alts.join(", ")})</span>}
                  {p!.desc && <div className="text-xs text-ink-dim">{p!.desc}</div>}
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2 border-t border-line pt-3">
          <div className="text-sm font-semibold">Move or equip</div>
          <div className="flex flex-wrap gap-2">
            {inv.characters.filter(c => canWear(c.id)).map(c => (
              <Button key={`e${c.id}`} size="sm" disabled={busy || (item.owner === c.id && item.equipped)} onClick={() => setAsk({ kind: "equip", on: c.id })}>Equip on {c.cls}</Button>
            ))}
            {inv.characters.filter(c => c.id !== item.owner).map(c => (
              <Button key={`m${c.id}`} size="sm" variant="ghost" disabled={busy} onClick={() => setAsk({ kind: "move", to: c.id })}>Move to {c.cls}</Button>
            ))}
            {item.owner !== "vault" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsk({ kind: "move", to: "vault" })}>Move to vault</Button>}
          </div>
          {ask && (
            <div className="space-y-2 rounded-xl border border-accent-hi/40 bg-accent/10 p-3" data-testid="confirm">
              <p className="text-sm">{ask.kind === "equip" ? `Equip ${item.name} on your ${ownerName(ask.on)}?` : `Move ${item.name} to ${ask.to === "vault" ? "your vault" : `your ${ownerName(ask.to)}`}?`} Stand in orbit or a social space for equips.</p>
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => run(ask)}>{busy ? "Working…" : "Yes, do it"}</Button>
                <Button size="sm" variant="quiet" disabled={busy} onClick={() => setAsk(null)}>Cancel</Button>
              </div>
            </div>
          )}
          {msg && <p className={cn("text-sm", msg.ok ? "text-good" : "text-bad")} data-testid="action-result">{msg.text}</p>}
        </div>
      </Card>
    </div>
  );
}
