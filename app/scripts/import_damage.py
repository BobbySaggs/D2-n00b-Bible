"""Dev only: turn Aegis's Boss Damage sheet (xlsx copy) into src/knowledge/research/damage.json.

python3 -I scripts/import_damage.py <boss-damage.xlsx>
Reads the Sustained tab: sustained boss DPS per weapon setup, patch 9.7.0 (Monument of Triumph).
"""
import json, re, sys
import openpyxl

TYPE = {"sword": "Sword", "sniper": "Sniper Rifle", "shotgun": "Shotgun", "rocket": "Rocket Launcher",
        "fusion": "Fusion Rifle", "scout": "Scout Rifle", "HGL": "Grenade Launcher", "BGL": "Grenade Launcher",
        "LMG": "Machine Gun", "linear": "Linear Fusion Rifle", "bow": "Combat Bow", "glaive": "Glaive",
        "trace": "Trace Rifle", "SMG": "Submachine Gun", "pulse": "Pulse Rifle", "HC": "Hand Cannon",
        "auto": "Auto Rifle", "sidearm": "Sidearm"}
AMMO = {"primary": 1, "special": 2, "power": 3}
TYPE_WORDS = r"(linear fusion rifle|burst linear fusion rifle|fusion rifle|rocket launcher|grenade launcher|machine gun|slug shotgun|shotgun|sniper|sword|glaive|bow|trace rifle)$"

# Team buffs and setups in the notes that are not perks on the gun itself.
NOT_GUN = {"Pack Hunter", "Turncoat transfer", "Sentinel flicker", "simulated"}

def tokens(setup: str) -> list[str]:
    out = []
    for part in re.split(r",|\+|\band\b", setup):
        t = re.sub(r"\([^)]*\)", "", part)
        t = re.sub(r"\bx\s?\d+\b|\bx$", "", t).strip()
        t = re.sub(r"^e\.\s*", "", t).strip(" .")
        if t in NOT_GUN:
            continue
        if 2 < len(t) < 40 and not re.search(r"\d+%|consistency|pre-|swap|spam|combo|cycle|includes|assum", t, re.I):
            out.append(t)
    return out

def main(path: str):
    ws = openpyxl.load_workbook(path, data_only=True)["Sustained"]
    rows = []
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if r[0] and re.search(r"exploit", str(r[0]), re.I):
            continue  # needs a bug or exploit, not normal play
        if not r[0] or r[1] not in AMMO or r[2] not in TYPE or not isinstance(r[19], (int, float)):
            continue
        name, _, setup = str(r[0]).partition("\n")
        name = name.strip()
        m = re.search(TYPE_WORDS, name, re.I)
        frame = name[: m.start()].strip() if m and m.start() > 0 else ""
        rows.append({"name": name, "frame": frame, "type": TYPE[r[2]], "ammo": AMMO[r[1]],
                     "setup": " ".join(setup.split()), "perks": tokens(setup),
                     "dps": round(r[19]), "total": round(r[18]) if isinstance(r[18], (int, float)) else None})
    out = {"source": "Aegis, Destiny 2: Boss Damage (Sustained tab), patch 9.7.0", "url":
           "https://docs.google.com/spreadsheets/d/1_5wtBjRYHHxuF4oJKDb_iOGZs-wTkzB6RYbnyNLbuz4/edit", "rows": rows}
    json.dump(out, open("src/knowledge/research/damage.json", "w"), indent=0)
    print(len(rows), "rows;", sum(1 for x in rows if x["frame"]), "frame rows")

main(sys.argv[1])
