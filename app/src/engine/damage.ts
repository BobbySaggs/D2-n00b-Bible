// Real boss damage numbers: Aegis's Boss Damage sheet (Sustained tab, patch 9.7.0), imported by scripts/import_damage.py.
// Every row is one tested setup: a weapon (an exotic by name, or a legendary frame and type), the perks it ran,
// and the sustained DPS it reached on a boss with the sheet's standard buffs. Rows are compared with each other,
// so the shared buff assumptions cancel out.
import file from "../knowledge/research/damage.json";

export interface DamageRow { name: string; frame: string; type: string; ammo: number; setup: string; perks: string[]; dps: number; total: number | null }
export const DAMAGE = file as { source: string; url: string; rows: DamageRow[] };

export interface DamageRead {
  dps: number; // sustained boss DPS this copy reaches with the perks it has slotted
  best: number; // the best tested setup for this weapon or frame
  row: DamageRow; // the tested setup it matched
  missing: string[]; // tested perks this copy doesn't have slotted
  exact: boolean; // every tested perk is slotted
}

const norm = (s: string) => s.toLowerCase().replace(/enhanced|frame|[^a-z0-9]/g, "");

// The weapon perk names Steeped has seen on any gun, so a row's setup words that aren't gun perks
// (subclass pieces, exotics, artifact perks) don't count as missing.
const PERKS = new Set<string>();
export function knowPerks(names: Iterable<string>) { for (const n of names) PERKS.add(norm(n)); }

export interface Gun { name: string; exotic: boolean; frame: string; type: string; ammo: number; perks: string[] }

export function rowsFor(g: Gun): DamageRow[] {
  if (g.exotic) return DAMAGE.rows.filter(r => !r.frame && norm(r.name) === norm(g.name));
  const f = norm(g.frame);
  if (!f) return [];
  return DAMAGE.rows.filter(r => r.frame && r.type === g.type && r.ammo === g.ammo && (f.startsWith(norm(r.frame)) || norm(r.frame).startsWith(f)));
}

// A copy that has some of a setup's perks gets partial credit, so tuning perks one column at a time still finds the combo.
export function damageOf(g: Gun): DamageRead | null {
  const rows = rowsFor(g);
  if (!rows.length) return null;
  const have = new Set(g.perks.map(norm));
  let out: DamageRead | null = null;
  const best = Math.max(...rows.map(r => r.dps));
  for (const row of rows) {
    const need = row.perks.filter(p => PERKS.has(norm(p)));
    const missing = need.filter(p => !have.has(norm(p)));
    const share = need.length ? (need.length - missing.length) / need.length : 1;
    const dps = Math.round(row.dps * (0.6 + 0.4 * share));
    if (!out || dps > out.dps) out = { dps, best, row, missing, exact: missing.length === 0 };
  }
  return out;
}

// Points for the boss-damage goal, on the same scale as Steeped's other weapon points. The top heavy setups sit near 18,000.
export const DPS_REF = 15000;
export const dpsPoints = (d: DamageRead, ammo: number) => (ammo === 3 ? 8 : ammo === 2 ? 5 : 3) * d.dps / DPS_REF;
