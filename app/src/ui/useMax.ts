import { useEffect, useState } from "react";
import { DEFS } from "../bungie/defs";
import type { CatalogEntry } from "../bungie/catalog";
import type { Inventory } from "../model/inventory";
import type { MaxHunter } from "../engine/maxhunter";
import { runMax } from "../workers/search";

// The Max Hunter result for Home, Builds and Journey: first your kit and path, then the slower check against every
// exotic in the game. Both runs are cached per load, so switching tabs never searches again.
export function useMax(inv: Inventory, catalog: CatalogEntry[]): { m: MaxHunter | null; err: string } {
  const hunter = inv.characters.find(c => c.cls === "Hunter");
  const [m, setM] = useState<MaxHunter | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!hunter) return;
    let live = true;
    const defs = [...DEFS.values()];
    runMax(inv, defs, hunter.id, catalog, false)
      .then(r => { if (!live) return; setM(cur => cur ?? r); return runMax(inv, defs, hunter.id, catalog, true).then(full => { if (live) setM(full); }); })
      .catch(e => { if (live) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [inv, hunter, catalog]);
  return { m, err };
}
