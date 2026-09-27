/**
 * Test di equivalenza con l'applicazione Python originale.
 * I file in tests/fixtures sono generati da tests/tools/generate_golden.py
 * eseguendo il codice Python originale.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DashboardController } from '../src/core/controller';
import { buildCards, buildDashboardModel, collectApiIds, type CardView, type UnitView } from '../src/core/dashboard';
import type { BattleEvent, PlayerBattles } from '../src/core/models';
import { fmtTs, normalizeScore, toApiId } from '../src/core/format';
import { loadWarReport, parseWarReport } from '../src/core/parser';
import { pyJsonLoads } from '../src/core/pyjson';
import { floatRepr, PyFloat, type PyValue } from '../src/core/pyvalue';
import { primeCache } from '../src/core/portraits';

const ROOT = resolve(__dirname, '..');
const fixture = (name: string) => JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures', name), 'utf-8'));

// --- Conversione dei valori nella rappresentazione dei golden ------------------

type Tagged = { t: string; v?: unknown };

function tag(v: PyValue): Tagged {
  if (v === null) return { t: 'None' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number' || typeof v === 'bigint') return { t: 'int', v: v.toString() };
  if (v instanceof PyFloat) return { t: 'float', v: floatRepr(v.value) };
  if (typeof v === 'string') return { t: 'str', v };
  if (Array.isArray(v)) return { t: 'list', v: v.map(tag) };
  return { t: 'dict', v: Array.from(v.entries()).map(([k, x]) => [k, tag(x)]) };
}

// --- Colori delle etichette dell'originale -------------------------------------

const MUTED = ['gray35', 'gray65'];
const TONE: Record<string, unknown> = { alive: ['gray5', 'white'], dead: ['gray55', 'gray45'], mow: '#FFD700' };

function unitLabel(u: UnitView) {
  if (u.kind !== 'text') throw new Error('attesa etichetta testuale');
  return { text: u.text, color: TONE[u.tone] };
}

/** Sequenza di etichette Tk che l'originale crea per una card. */
function flattenCard(card: CardView) {
  const out: { text: string; color: unknown }[] = [
    { text: card.timestamp, color: null },
    { text: card.zone, color: MUTED },
    { text: card.score, color: card.anyAttackerAlive ? '#4CAF50' : '#E04B4B' },
  ];
  if (card.buffs.length) {
    out.push({ text: 'Potenziamenti:', color: MUTED });
    for (const b of card.buffs) out.push({ text: b, color: '#80BFFF' });
  }
  for (const [label, team] of [
    ['Attaccante:', card.attacker],
    ['Difensore:', card.defender],
  ] as const) {
    out.push({ text: label, color: MUTED });
    team.units.forEach((u) => out.push(unitLabel(u)));
    if (team.mow) {
      out.push({ text: '|', color: MUTED });
      out.push(unitLabel(team.mow));
    }
  }
  return out;
}

interface GoldenPlayer {
  name: string;
  count: string | null;
  error: string | null;
  cards: { text: string; color: unknown }[][];
}

interface GoldenDashboard {
  dashboard: 'ok' | 'error';
  options?: string[];
  players?: GoldenPlayer[];
}

/** Esegue la dashboard della SPA selezionando i giocatori in sequenza, come il generatore Python. */
function runDashboard(content: string, fileName = 'report.json'): GoldenDashboard {
  const report = parseWarReport(fileName, content);
  let model;
  try {
    model = buildDashboardModel(report);
  } catch {
    return { dashboard: 'error' };
  }
  const ctrl = new DashboardController(model);
  const players: GoldenPlayer[] = [];
  for (const name of model.options.slice(1)) {
    // Nessuna immagine disponibile: fallback testuale (come nel generatore)
    const pb = model.battles.get(model.nameToUid.get(name) as string);
    try {
      if (pb) collectApiIds(pb).forEach((id) => primeCache(id, null));
    } catch {
      /* l'errore si ripresenta nel controller */
    }
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (e: unknown) => errors.push(e);
    ctrl.onPlayerChanged(name);
    console.error = orig;
    const c = ctrl.state.content;
    players.push({
      name,
      count: ctrl.state.count === '' ? null : ctrl.state.count,
      error: errors.length ? 'error' : null,
      cards: c.kind === 'cards' ? c.cards.map(flattenCard) : [],
    });
  }
  return { dashboard: 'ok', options: model.options, players };
}

function normalizeGolden(g: GoldenDashboard): GoldenDashboard {
  if (g.dashboard !== 'ok') return { dashboard: 'error' };
  return {
    dashboard: 'ok',
    options: g.options,
    players: g.players!.map((p) => ({
      ...p,
      count: p.count === '' ? null : p.count,
      error: p.error ? 'error' : null,
    })),
  };
}

// --- Test ---------------------------------------------------------------------

describe('json.loads', () => {
  const cases = fixture('json_cases.json') as { input: string; ok?: Tagged; err?: string }[];
  it.each(cases.map((c) => [JSON.stringify(c.input), c] as const))('%s', (_label, c) => {
    if (c.err !== undefined) {
      expect(() => pyJsonLoads(c.input)).toThrowError(c.err);
      try {
        pyJsonLoads(c.input);
      } catch (e) {
        expect((e as Error).message).toBe(c.err);
      }
    } else {
      expect(tag(pyJsonLoads(c.input))).toEqual(c.ok);
    }
  });
});

describe('load_war_report', () => {
  const cases = fixture('file_cases.json') as Record<string, { hex: string; ok?: boolean; err?: string }>;
  it.each(Object.entries(cases))('%s', async (_name, c) => {
    const bytes = Uint8Array.from(c.hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);
    const file = new File([bytes], 'report.json');
    if (c.ok) {
      await expect(loadWarReport(file)).resolves.toBeTruthy();
    } else {
      await expect(loadWarReport(file)).rejects.toThrowError(c.err);
      await loadWarReport(file).catch((e: Error) => expect(e.message).toBe(c.err));
    }
  });

  it('rifiuta file oltre 10 MB', async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.json');
    await expect(loadWarReport(file)).rejects.toThrowError(
      'Il file selezionato supera la dimensione massima consentita (10 MB).',
    );
  });

  it('accetta file di esattamente 10 MB', async () => {
    const body = new Uint8Array(10 * 1024 * 1024).fill(0x20);
    body.set(new TextEncoder().encode('{"eventResults":[]}'));
    await expect(loadWarReport(new File([body], 'ok.json'))).resolves.toBeTruthy();
  });
});

describe('helper', () => {
  const h = fixture('helpers.json');
  it('_to_api_id', () => {
    for (const [id, api] of Object.entries(h.api_ids)) expect(toApiId(id)).toBe(api);
  });
  it('_normalize_score', () => {
    for (const [s, n] of Object.entries(h.scores)) expect(normalizeScore(Number(s))).toBe(n);
  });
  it('_fmt_ts', () => {
    for (const [t, s] of Object.entries(h.timestamps)) expect(fmtTs(Number(t))).toBe(s);
  });
});

describe('dashboard sul file di esempio', () => {
  it('produce esattamente le stesse schermate', () => {
    const golden = fixture('sample_dashboard.json') as GoldenDashboard;
    const content = readFileSync(resolve(ROOT, 'python_original/sample/b1'), 'utf-8');
    const got = runDashboard(content, 'b1');
    const exp = normalizeGolden(golden);
    expect(got.options).toEqual(exp.options);
    expect(got.players!.length).toBe(exp.players!.length);
    got.players!.forEach((p, i) => expect(p).toEqual(exp.players![i]));
  });
});

describe('dashboard su documenti sintetici (casi limite)', () => {
  const docs = fixture('synthetic_docs.json') as Record<string, { doc: string; result: GoldenDashboard }>;
  it.each(Object.entries(docs))('%s', (_name, { doc, result }) => {
    expect(runDashboard(doc)).toEqual(normalizeGolden(result));
  });
});

describe('ritratti: pipeline di _make_ctk e barra rossa disegnata sulla cache', () => {
  const unit = (unitId: string, alive: boolean, hadHpBefore = true) => ({ unitId, alive, hadHpBefore });
  const ev = (attacker: ReturnType<typeof unit>[], defender: ReturnType<typeof unit>[], mow: string | null, createdOnMs: number): BattleEvent => ({
    battleId: 'x', createdOnMs, zoneType: 'HQ', zoneVisualId: '', score: 1, attackerUserId: 'u',
    attackerUnits: attacker, attackerMow: mow ? { unitId: mow } : null,
    defenderUserId: null, defenderUnits: defender, defenderMow: null, buffAbilityIds: [],
  });

  it('segue lo stesso ordine di render e gli stessi effetti collaterali di PIL', () => {
    primeCache('templ_initiate', 'https://example/initiate.png');
    primeCache('orkss_nob', null);
    // Card renderizzate dalla piu' recente: ev2 prima di ev1
    const ev2 = ev([unit('templNpc1Initiate', true)], [unit('templNpc1Initiate', false, false), unit('templNpc1Initiate', true, false), unit('orksNob', false, false)], null, 2);
    const ev1 = ev([unit('templNpc1Initiate', true)], [unit('templNpc1Initiate', false)], 'templNpc1Initiate', 1);
    const pb: PlayerBattles = { userId: 'u', displayName: 'u', battles: [ev1, ev2] };
    const [c2, c1] = buildCards(pb);
    const img = (u: UnitView) => (u.kind === 'image' ? [u.alive, u.hadHpBefore, u.isMow, u.tainted] : u);

    expect(img(c2.attacker.units[0])).toEqual([true, true, false, false]); // prima della barra
    expect(img(c2.defender.units[0])).toEqual([false, false, false, false]); // morto: copia grigia, cache intatta
    expect(img(c2.defender.units[1])).toEqual([true, false, false, false]); // vivo senza HP prima: barra sulla cache
    expect(c2.defender.units[2]).toEqual({ kind: 'text', text: 'orksNob', tone: 'dead' }); // fallback testuale
    expect(img(c1.attacker.units[0])).toEqual([true, true, false, true]); // ora la cache ha la barra
    expect(c1.attacker.mow && img(c1.attacker.mow)).toEqual([true, true, true, true]); // anche nella MoW
    expect(img(c1.defender.units[0])).toEqual([false, true, false, true]); // e nella versione grigia
  });
});
