"""Genera i file "golden" eseguendo il codice Python originale.

I test della SPA (vitest) confrontano il proprio output con questi file, per
verificare che il comportamento sia identico all'applicazione desktop.

customtkinter viene sostituito da uno stub che registra i widget creati, in modo
da eseguire la vera logica di DashboardView/_BattleCard senza interfaccia grafica.
Richiede Pillow (importato dal modulo originale) e tzdata su Windows.

Uso:  python tests/tools/generate_golden.py
"""

from __future__ import annotations

import json
import sys
import tempfile
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "python_original" / "src"
SAMPLE = ROOT / "python_original" / "sample"
OUT = ROOT / "tests" / "fixtures"

# --- Stub di customtkinter ----------------------------------------------------

LABELS: list[dict] = []


class Dummy:
    def __init__(self, *args, **kwargs):
        self.kw = dict(kwargs)
        if type(self).__name__ == "CTkLabel":
            LABELS.append(self.kw)

    def configure(self, **kwargs):
        self.kw.update(kwargs)

    def winfo_children(self):
        return []

    def winfo_exists(self):
        return False

    def __getattr__(self, name):
        return lambda *a, **k: Dummy()


ctk = types.ModuleType("customtkinter")
for _name in ["CTk", "CTkFrame", "CTkLabel", "CTkButton", "CTkOptionMenu", "CTkScrollableFrame", "CTkImage", "CTkFont", "StringVar"]:
    setattr(ctk, _name, type(_name, (Dummy,), {}))


class CTkOptionMenu(Dummy):
    """Come customtkinter 5.2: DropdownMenu._add_menu_commands usa value.ljust(...) nel costruttore."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for value in kwargs.get("values") or []:
            value.ljust(0)


ctk.CTkOptionMenu = CTkOptionMenu
ctk.set_appearance_mode = lambda *a: None
ctk.set_default_color_theme = lambda *a: None
sys.modules["customtkinter"] = ctk

sys.path.insert(0, str(SRC))

from hm_war_analyzer.core import parser as P  # noqa: E402
from hm_war_analyzer.gui import dashboard_view as D  # noqa: E402

# --- Utilita' -------------------------------------------------------------------


def tag(v):
    """Rappresentazione esplicita dei tipi Python per il confronto."""
    if v is None:
        return {"t": "None"}
    if isinstance(v, bool):
        return {"t": "bool", "v": v}
    if isinstance(v, int):
        return {"t": "int", "v": str(v)}
    if isinstance(v, float):
        return {"t": "float", "v": repr(v)}
    if isinstance(v, str):
        return {"t": "str", "v": v}
    if isinstance(v, list):
        return {"t": "list", "v": [tag(x) for x in v]}
    if isinstance(v, dict):
        return {"t": "dict", "v": [[k, tag(x)] for k, x in v.items()]}
    raise TypeError(type(v))


def color(c):
    return list(c) if isinstance(c, tuple) else c


# --- 1. json.loads ----------------------------------------------------------------

JSON_CASES = [
    "", " ", "{", "[", "]", "}", "nul", "null", "true", "false", "NaN", "Infinity", "-Infinity",
    "-Infinit", "-", "-0", "0", "01", "1.", "1.5", "1e5", "1E+5", "1e", "1e-", "-1.5e-3", "1.0",
    "123456789012345678901234567890", "1e400", "-1e400", "[1,]", "[1 2]", "[,]", "{,}", '{"a":1,}',
    '{"a" 1}', '{"a":}', "{a:1}", '{"a":1 "b":2}', '{"a":1}x', '{"a":1}  \n ', "﻿{}",
    '"abc', '"a\\x"', '"\\u12"', '"\\u12G4"', '"\\ud83d\\ude00"', '"\\ud83d"', '"\\ud83d\\u0041"',
    '"\\ud83d\\ude0"', '"a\tb"', '"a\nb"', '"é😀"', '["é😀", 1, x]', '{"a":[1,{"b":[}]}',
    '{"x":1,"x":2}', '{"eventResults": []}', "[1,\n2,\n,3]", "  \n\n  [\n  tru ]", '"\\/\\b\\f\\n\\r\\t\\"\\\\"',
    "[NaN, Infinity, -Infinity, -0.0, 1e16, 1e15, 0.0001, 0.00001, 123.456, 1e22, 5e-324]",
    '{"a":1,\n"b":2,\n}', "[\n\n", "[1] [2]", "[ ]", "{ }", '[""]', "[-]", "[--1]", "[1.e5]", "[.5]",
    "[+1]", "[0x10]", "[1e5.5]", "[truee]", "[true", '["\\u00e9"]',
]


def json_case(s):
    try:
        return {"ok": tag(json.loads(s))}
    except json.JSONDecodeError as e:
        return {"err": str(e)}


# --- 2. Lettura file (load_war_report) -----------------------------------------------

FILE_CASES = {
    "utf8_invalid_start": b'{"eventResults": "\xff"}',
    "utf8_invalid_cont1": b'{"a": "\xe2\x41"}',
    "utf8_invalid_cont2": b'{"a": "\xe2\x82\x41"}',
    "utf8_end1": b'{"a": 1}\xe2',
    "utf8_end2": b'{"a": 1}\xe2\x82',
    "utf8_end4": b'{"a": 1}\xf0\x9f\x98',
    "utf8_surrogate": b'{"a": "\xed\xa0\x80"}',
    "utf8_overlong": b'{"a": "\xc0\xaf"}',
    "utf8_overlong3": b'{"a": "\xe0\x80\xaf"}',
    "utf8_toobig": b'{"a": "\xf4\x90\x80\x80"}',
    "utf8_f5": b'{"a": "\xf5"}',
    "utf8_ok": '{"eventResults": ["é😀"]}'.encode(),
    "bom": b'\xef\xbb\xbf{"eventResults": []}',
    "crlf_error": b'{\r\n"a": 1,\r\n"b": \r\n}',
    "cr_error": b'{\r"a": 1,\r"b" 2}',
    "not_json": b"hello",
    "empty": b"",
    "list_root": b'[{"eventResults": []}]',
    "missing_key": b'{"eventresults": []}',
    "null_value": b'{"eventResults": null}',
    "ok": b'{"eventResults": []}',
}


def file_case(data: bytes):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "report.json"
        p.write_bytes(data)
        try:
            P.load_war_report(p)
            return {"ok": True}
        except P.WarReportParseError as e:
            return {"err": str(e)}


# --- 3. Dashboard completa ----------------------------------------------------------


class RecordingCard(D._BattleCard):
    cards: list = []

    def __init__(self, master, event):
        start = len(LABELS)
        super().__init__(master, event)
        RecordingCard.cards.append(LABELS[start:])


D._BattleCard = RecordingCard


def label_view(kw):
    return {"text": tk_text(kw.get("text")), "color": color(kw.get("text_color"))}


def tk_text(v):
    if isinstance(v, bool):
        return "1" if v else "0"
    return str(v)


def run_dashboard(raw: dict, file_name: str = "report.json"):
    """Esegue DashboardView sul report e registra tutto cio' che viene mostrato."""
    report = P.WarReport(file_path=Path(file_name), raw_data=raw)
    LABELS.clear()
    try:
        view = D.DashboardView(Dummy(), report)
    except Exception as e:  # la dashboard non viene mostrata
        return {"dashboard": "error", "error": type(e).__name__}

    names = [n for n in sorted(view._name_to_uid)]
    players = []
    for name in names:
        RecordingCard.cards = []
        error = None
        try:
            view._on_player_changed(name)
        except Exception as e:
            error = type(e).__name__
        players.append({
            "name": name,
            "count": view._count_lbl.kw.get("text"),
            "error": error,
            "cards": [[label_view(kw) for kw in card] for card in RecordingCard.cards],
        })
    return {"dashboard": "ok", "options": [view._placeholder] + names, "players": players}


class NoImages(dict):
    """Cache in cui ogni ritratto risulta gia' scaricato ma non disponibile (fallback testuale)."""

    def __contains__(self, key):
        return True

    def get(self, key, default=None):
        return None


D._IMG_CACHE = NoImages()


def sample_dashboard():
    # Copia del file di esempio usata anche dai test (python_original non e' versionato)
    (OUT / "sample_b1.json").write_bytes((SAMPLE / "b1").read_bytes())
    raw = json.loads((SAMPLE / "b1").read_text(encoding="utf-8"))
    return run_dashboard(raw, "b1")


def synthetic_docs():
    def bf(**kw):
        base = {
            "type": "battleFinished", "id": "x", "userId": "u1", "teamIndex": 1,
            "zone": {"type": "Trenches1", "visualId": "t"}, "score": 100, "createdOn": 1789811432826,
            "attacker": {"userId": "u1", "units": [{"unitId": "ultraCalgar", "remainingHPAfter": 5}]},
            "defender": {"units": [{"unitId": "orksNob", "remainingHPBefore": 5}]},
        }
        base.update(kw)
        return base

    guild = [{"name": "[ITA] Ordo Malleus", "teamIndex": 1}]

    def doc(logs, players=None, guilds=guild):
        return {"eventResults": [{"eventResponseData": {
            "activityLogs": logs, "playerData": players or [], "guildData": guilds}}]}

    return {
        "basic": doc([bf(), bf(score=17600, createdOn=1789811432000), bf(teamIndex=2, userId="u9", attacker={"userId": "u9"})],
                     [{"userId": "u1", "displayName": "Alpha"}]),
        "no_guild": doc([bf(), bf(teamIndex=2, userId="u9", attacker={"userId": "u9"})], guilds=[]),
        "float_team": doc([bf(teamIndex=1.0), bf(teamIndex=True, userId="u2", attacker={"userId": "u2"})]),
        "dup_names": doc([bf(), bf(userId="u2", attacker={"userId": "u2abcdefgh"})],
                         [{"userId": "u1", "displayName": "Same"}, {"userId": "u2abcdefgh", "displayName": "Same"}]),
        "score_float": doc([bf(score=1601.0), bf(score=17600.5), bf(score=2000.0)]),
        "score_bool": doc([bf(score=True)]),
        "score_null": doc([bf(score=None)]),
        "score_missing": doc([{k: v for k, v in bf().items() if k != "score"}]),
        "score_str": doc([bf(score="10")]),
        "big_total": doc([bf(score=1600) for _ in range(900)]),
        "big_int_score": doc([bf(score=123456789012345678901234567890)]),
        "no_attacker": doc([{k: v for k, v in bf().items() if k != "attacker"}]),
        "no_uid": doc([bf(userId=None, attacker={})]),
        "int_uid": doc([bf(userId=5, attacker={})]),
        "num_display": doc([bf()], [{"userId": "u1", "displayName": 5}]),
        "empty_display": doc([bf()], [{"userId": "u1", "displayName": ""}]),
        "missing_player": doc([bf(userId="abcdefghijkl", attacker={"userId": "abcdefghijkl"})]),
        "created_str": doc([bf(createdOn="x"), bf(createdOn="y")]),
        "created_str_single": doc([bf(createdOn="x")]),
        "created_null_single": doc([bf(createdOn=None)]),
        "created_missing": doc([{k: v for k, v in bf().items() if k != "createdOn"}]),
        "created_float": doc([bf(createdOn=1789811432826.9), bf(createdOn=0.5)]),
        "created_dst": doc([bf(createdOn=1774747800000), bf(createdOn=1792454400000), bf(createdOn=1761440400000)]),
        "zone_weird": doc([bf(zone={"type": "HQ"}), bf(zone={"type": "abcDef12Gh3"}), bf(zone=None), bf(zone={"type": "Bunker٣"})]),
        "zone_num": doc([bf(), bf(zone={"type": 5}, createdOn=1)]),
        "hp_str": doc([bf(attacker={"userId": "u1", "units": [{"unitId": "a", "remainingHPAfter": "5"}]})]),
        "hp_float": doc([bf(attacker={"userId": "u1", "units": [{"unitId": "a", "remainingHPAfter": 0.1}, {"unitId": "b", "remainingHPAfter": 0.0}]})]),
        "unit_null": doc([bf(attacker={"userId": "u1", "units": [{"unitId": None, "remainingHPAfter": 5}]})]),
        "unit_missing": doc([bf(attacker={"userId": "u1", "units": [{"remainingHPAfter": 5}]})]),
        "buffs": doc([bf(buffs=[{"abilityId": "EnvFlakFire"}, {"abilityId": ""}, {"abilityId": "Other"}, {"x": 1}, {"abilityId": 7}, {"abilityId": True}, {"abilityId": 2.5}])]),
        "buffs_unhashable": doc([bf(buffs=[{"abilityId": [1]}]), bf(createdOn=1)]),
        "mow": doc([bf(attacker={"userId": "u1", "units": [], "machineOfWar": {"unitId": "blackForgefiend"}},
                       defender={"units": [{"unitId": "x", "remainingHPAfter": 3}], "machineOfWar": {}})]),
        "defender_hp": doc([bf(defender={"units": [
            {"unitId": "a", "remainingHPBefore": 0, "remainingHPAfter": 0},
            {"unitId": "b", "remainingHPBefore": 10, "remainingHPAfter": 10},
            {"unitId": "c"},
            {"unitId": "d", "remainingHPAfter": 4}]})]),
        "events_dict": {"eventResults": {}},
        "events_null": {"eventResults": None},
        "events_str": {"eventResults": "ab"},
        "erd_null": {"eventResults": [{"eventResponseData": None}]},
        "logs_non_battle": doc([{"type": "zoneDestroyed"}, bf()]),
        "log_not_dict": doc([5]),
        "placeholder_name": doc([bf()], [{"userId": "u1", "displayName": "— Seleziona un giocatore —"}]),
        "sort_names": doc([bf(userId=f"u{i}", attacker={"userId": f"u{i}"}) for i in range(5)],
                          [{"userId": "u0", "displayName": "b"}, {"userId": "u1", "displayName": "B"},
                           {"userId": "u2", "displayName": "😀x"}, {"userId": "u3", "displayName": "Ａ"},
                           {"userId": "u4", "displayName": "「ITA」z"}]),
    }


# --- 5. Helper ------------------------------------------------------------------------


def helpers():
    unit_ids = sorted({
        u["unitId"]
        for er in json.loads((SAMPLE / "b1").read_text(encoding="utf-8"))["eventResults"]
        for log in er["eventResponseData"]["activityLogs"]
        for side in ("attacker", "defender")
        for u in ((log.get(side) or {}).get("units") or []) + [((log.get(side) or {}).get("machineOfWar") or {"unitId": "none"})]
    }) + ["", "abc", "ABC", "eldarX", "orks", "tauFoo", "nothing_Upper", "é9Ab"]
    return {
        "api_ids": {u: D._to_api_id(u) for u in unit_ids},
        "scores": {str(s): D._normalize_score(s) for s in [0, 1601, 1602, 9999, 10000, 10450, 11601, 16000, 17601, 30000, 31601, 40000, 41601, 45000, 50000, -5]},
        "timestamps": {str(t): D._fmt_ts(t) for t in [0, 1789811432826, 1774747800000, 1774749600000, 1792454400000, 1761440400000, 1761444000000, -86400000, 1711846800000, 1711846799999, 1729990800000, 1729987200000]},
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "json_cases.json").write_text(json.dumps([{"input": s, **json_case(s)} for s in JSON_CASES], ensure_ascii=True, indent=1), encoding="utf-8")
    (OUT / "file_cases.json").write_text(json.dumps({k: {"hex": v.hex(), **file_case(v)} for k, v in FILE_CASES.items()}, ensure_ascii=True, indent=1), encoding="utf-8")
    (OUT / "sample_dashboard.json").write_text(json.dumps(sample_dashboard(), ensure_ascii=True), encoding="utf-8")
    (OUT / "synthetic_docs.json").write_text(json.dumps({k: {"doc": json.dumps(v), "result": run_dashboard(v)} for k, v in synthetic_docs().items()}, ensure_ascii=True, indent=1), encoding="utf-8")
    (OUT / "helpers.json").write_text(json.dumps(helpers(), ensure_ascii=True, indent=1), encoding="utf-8")
    print("golden generati in", OUT)
