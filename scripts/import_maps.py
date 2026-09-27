#!/usr/bin/env python3
"""
Importa la configurazione delle mappe di una guerra di gilda da una pagina
"Map Preview" di tacticus.xyz salvata dal browser e aggiorna src/data/war_maps.json.

Uso:
    python3 scripts/import_maps.py PAGINA.html [PAGINA2.html ...] [--dry-run] [--force]

La pagina (es. https://www.tacticus.xyz/wars/preview/maps?battle=4&season=27) va
salvata dal browser con Ctrl+S: tacticus.xyz e' protetto da Cloudflare e non puo'
essere scaricato con curl.

Il file JSON prodotto ha la forma:
    { "27.4": { "HQ": "LHE_Desert_03", "Trenches1": "C1_15", ... }, ... }
dove la chiave e' "<stagione>.<round>" e i valori sono i codici delle mappe
(immagine: https://cdn.ezekiel.snowprintstudios.com/<codice>_Visual.png).
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "src" / "data" / "war_maps.json"

# zone.type delle guerre di gilda, nell'ordine usato per scrivere il JSON
KNOWN_ZONES = [
    "HQ",
    "Armoury",
    "SupplyDepot",
    "AntiAirBattery",
    "LandingPad1",
    "LandingPad2",
    "ArtilleryPosition1",
    "ArtilleryPosition2",
    "MedicaeStation1",
    "MedicaeStation2",
    "Bunker1",
    "Bunker2",
    "Trenches1",
    "Trenches2",
    "Trenches3",
]

SEASON_RE = re.compile(r"Season\s+(\d+)\.(\d+)\s*-\s*Map Preview")
MODAL_RE = re.compile(r"openMapModal\(\s*'preview-([A-Za-z0-9]+)'\s*,\s*'([^']*)'\s*\)")
MAP_CODE_RE = re.compile(r"^[A-Za-z0-9_]+$")


class ImportError_(Exception):
    """Errore di importazione: il file JSON non viene modificato."""


def parse_page(path: Path, force: bool) -> tuple[str, dict[str, str]]:
    """Restituisce ("<stagione>.<round>", {zone.type: codice mappa})."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ImportError_(f"{path}: impossibile leggere il file ({exc})") from exc

    if "Just a moment..." in text and "openMapModal" not in text:
        raise ImportError_(
            f"{path}: e' la pagina di verifica di Cloudflare, non l'anteprima delle mappe. "
            "Aprire la pagina nel browser e salvarla da li'."
        )

    m = SEASON_RE.search(html.unescape(text))
    if not m:
        raise ImportError_(f"{path}: titolo 'Season X.Y - Map Preview' non trovato.")
    key = f"{int(m.group(1))}.{int(m.group(2))}"

    zones: dict[str, str] = {}
    for zone, code in MODAL_RE.findall(text):
        if not MAP_CODE_RE.match(code):
            raise ImportError_(f"{path}: codice mappa non valido per {zone}: {code!r}")
        if zone in zones and zones[zone] != code:
            raise ImportError_(f"{path}: {zone} ha due mappe diverse ({zones[zone]}, {code}).")
        zones[zone] = code

    if not zones:
        raise ImportError_(f"{path}: nessuna zona trovata (struttura della pagina cambiata?).")

    missing = [z for z in KNOWN_ZONES if z not in zones]
    unknown = sorted(z for z in zones if z not in KNOWN_ZONES)
    problems = []
    if missing:
        problems.append(f"zone mancanti: {', '.join(missing)}")
    if unknown:
        problems.append(f"zone sconosciute: {', '.join(unknown)}")
    if problems:
        msg = f"{path}: " + "; ".join(problems)
        if not force:
            raise ImportError_(msg + " (usare --force per importare comunque)")
        print(f"ATTENZIONE {msg}", file=sys.stderr)

    ordered = {z: zones[z] for z in KNOWN_ZONES if z in zones}
    ordered.update({z: zones[z] for z in unknown})
    return key, ordered


def season_sort_key(key: str) -> tuple[int, ...]:
    return tuple(int(p) for p in key.split("."))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pages", nargs="+", type=Path, help="pagine 'Map Preview' salvate dal browser")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"file JSON (default: {DEFAULT_OUT.relative_to(ROOT)})")
    ap.add_argument("--dry-run", action="store_true", help="mostra il risultato senza scrivere il file")
    ap.add_argument("--force", action="store_true", help="importa anche con zone mancanti o sconosciute")
    args = ap.parse_args(argv)

    try:
        data: dict[str, dict[str, str]] = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else {}
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERRORE {args.out}: file non leggibile ({exc})", file=sys.stderr)
        return 1

    try:
        parsed = [parse_page(p, args.force) for p in args.pages]
    except ImportError_ as exc:
        print(f"ERRORE {exc}", file=sys.stderr)
        return 1

    changed = False
    for (key, zones), page in zip(parsed, args.pages):
        old = data.get(key)
        if old == zones:
            print(f"{key}: invariato ({page.name})")
            continue
        changed = True
        if old is None:
            print(f"{key}: aggiunto, {len(zones)} zone ({page.name})")
        else:
            print(f"{key}: aggiornato ({page.name})")
            for z in sorted(set(old) | set(zones)):
                if old.get(z) != zones.get(z):
                    print(f"  {z}: {old.get(z, '-')} -> {zones.get(z, '-')}")
        data[key] = zones
        for z, code in zones.items():
            print(f"  {z:<20} {code}")

    if not changed:
        return 0
    if args.dry_run:
        print("(dry-run: file non scritto)")
        return 0

    out = {k: data[k] for k in sorted(data, key=season_sort_key)}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Scritto {args.out.relative_to(ROOT) if args.out.is_relative_to(ROOT) else args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
