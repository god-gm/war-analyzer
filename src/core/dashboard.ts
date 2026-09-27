/**
 * Logica della dashboard indipendente dalla UI (port di DashboardView/_BattleCard/_unit_widget).
 */

import type { BattleEvent, MachineOfWar, PlayerBattles, UnitEntry, WarReport } from './models';
import { extractBattles, extractDefenses, findGuildTeamIndex } from './parser';
import { BUFF_LABELS, fmtTs, fmtZone, HOME_GUILD, normalizeScore, toApiId } from './format';
import { assertHashable, fmtThousands, PyError, pyAdd, pySortCmp, pyStr, strHead, tkStr, typeName, type PyValue } from './pyvalue';
import { getCached, isTainted, taint } from './portraits';

export const PLACEHOLDER = '— Seleziona un giocatore —';

/** Tab mostrate per il giocatore selezionato. */
export type Tab = 'attack' | 'defense';

export interface DashboardModel {
  fileName: string;
  battles: Map<string, PlayerBattles>;
  /** Attacchi subiti, per defender.userId */
  defenses: Map<string, PlayerBattles>;
  nameToUid: Map<string, string>;
  /** Voci del menu: placeholder + nomi ordinati */
  options: string[];
}

/** Costruttore di DashboardView: puo' sollevare eccezioni come l'originale. */
export function buildDashboardModel(report: WarReport): DashboardModel {
  const teamIndex = findGuildTeamIndex(report, HOME_GUILD);
  const battles = extractBattles(report, teamIndex);

  const nameToUid = new Map<string, string>();
  for (const [uid, pb] of battles) {
    let name: PyValue = pb.displayName;
    assertHashable(name);
    if (typeof name === 'string' && nameToUid.has(name)) {
      name = `${name} (${strHead(uid, 6)})`;
    }
    if (typeof name !== 'string') {
      // CTkOptionMenu richiede stringhe (value.ljust(...)): l'originale fallisce qui
      throw new PyError('AttributeError', `'${typeName(name)}' object has no attribute 'ljust'`);
    }
    nameToUid.set(name, uid);
  }

  // Giocatori che hanno solo difeso (nessun attacco): selezionabili per la tab Difesa
  const defenses = extractDefenses(report, teamIndex);
  const knownUids = new Set(nameToUid.values());
  for (const [uid, pb] of defenses) {
    if (knownUids.has(uid)) continue;
    let name = pb.displayName;
    if (typeof name !== 'string') continue;
    if (nameToUid.has(name)) name = `${name} (${strHead(uid, 6)})`;
    nameToUid.set(name, uid);
  }

  const sortedNames = Array.from(nameToUid.keys()).sort(pySortCmp);
  return { fileName: report.fileName, battles, defenses, nameToUid, options: [PLACEHOLDER, ...sortedNames] };
}

/** Totale punteggio e testo del contatore (può sollevare TypeError come l'originale). */
export function countLabel(pb: PlayerBattles): string {
  let total: PyValue = 0;
  for (const ev of pb.battles) total = pyAdd(total, normalizeScore(ev.score));
  return `(${pb.battles.length} attacchi  •  ${fmtThousands(total)} pt totali)`;
}

/** Contatore della tab Difesa: attacchi subiti e punti concessi agli avversari. */
export function defenseCountLabel(pb: PlayerBattles): string {
  let total: PyValue = 0;
  for (const ev of pb.battles) total = pyAdd(total, normalizeScore(ev.score));
  return `(${pb.battles.length} difese  •  ${fmtThousands(total)} pt concessi)`;
}

/** Tutti gli api_id necessari per il giocatore. */
export function collectApiIds(pb: PlayerBattles): Set<string> {
  const ids = new Set<string>();
  for (const ev of pb.battles) {
    for (const u of [...ev.attackerUnits, ...ev.defenderUnits]) ids.add(toApiId(u.unitId));
    if (ev.attackerMow) ids.add(toApiId(ev.attackerMow.unitId));
    if (ev.defenderMow) ids.add(toApiId(ev.defenderMow.unitId));
  }
  return ids;
}

// --- Card ---------------------------------------------------------------------

/**
 * Unita' da mostrare. Per le immagini, i flag descrivono la pipeline di _make_ctk:
 *  - tainted: l'immagine in cache ha gia' la barra rossa (disegnata da un render precedente)
 *  - alive=false: scala di grigi + luminosita' 0.35
 *  - hadHpBefore=false: barra rossa in cima (dopo il grigio)
 *  - isMow: bordo oro, immagine ridimensionata all'interno
 */
export type UnitView =
  | { kind: 'image'; src: string; unitId: string; alive: boolean; isMow: boolean; hadHpBefore: boolean; tainted: boolean }
  | { kind: 'text'; text: string; tone: 'alive' | 'dead' | 'mow' };

export interface TeamView {
  units: UnitView[];
  mow: UnitView | null;
}

export type CardOutcome = 'win' | 'loss' | 'cleanup';

export interface CardView {
  key: string;
  timestamp: string;
  zone: string;
  score: string;
  anyAttackerAlive: boolean;
  /**
   * Colore della card:
   *  - cleanup: difesa gia' parziale all'inizio (qualche unita' senza HP) e sterminata
   *  - win/loss: esito dal punto di vista del giocatore (attacco riuscito o difesa tenuta)
   */
  outcome: CardOutcome;
  buffs: string[];
  attacker: TeamView;
  defender: TeamView;
}

function unitWidget(unitId: PyValue, alive: boolean, isMow = false, hadHpBefore = true): UnitView {
  const apiId = toApiId(unitId);
  const pil = getCached(apiId);
  const id = unitId as string; // toApiId garantisce una stringa
  if (pil !== null) {
    const tainted = isTainted(apiId);
    // Se l'unita' e' viva, ImageDraw disegna la barra direttamente sull'immagine in cache
    if (alive && !hadHpBefore) taint(apiId);
    return { kind: 'image', src: pil, unitId: id, alive, isMow, hadHpBefore, tainted };
  }
  // Fallback testo
  if (isMow) return { kind: 'text', text: `⚙ ${id}`, tone: 'mow' };
  return { kind: 'text', text: id, tone: alive ? 'alive' : 'dead' };
}

function teamRow(units: UnitEntry[], mow: MachineOfWar | null): TeamView {
  const views = units.map((u) => unitWidget(u.unitId, u.alive, false, u.hadHpBefore));
  const mowView = mow ? unitWidget(mow.unitId, true, true) : null;
  return { units: views, mow: mowView };
}

function buffLabel(abId: PyValue): string {
  assertHashable(abId);
  if (typeof abId === 'string' && BUFF_LABELS.has(abId)) return BUFF_LABELS.get(abId) as string;
  return tkStr(abId);
}

function cardOutcome(ev: BattleEvent, anyAttackerAlive: boolean, tab: Tab): CardOutcome {
  const defenders = ev.defenderUnits;
  const startedPartial = defenders.some((u) => !u.hadHpBefore);
  const allDefendersDead = defenders.length > 0 && defenders.every((u) => !u.alive);
  if (startedPartial && allDefendersDead) return 'cleanup';
  const success = tab === 'attack' ? anyAttackerAlive : !anyAttackerAlive;
  return success ? 'win' : 'loss';
}

function buildCard(ev: BattleEvent, index: number, tab: Tab): CardView {
  const timestamp = fmtTs(ev.createdOnMs);
  const zone = `Bersaglio: ${fmtZone(ev.zoneType)}`;
  const anyAttackerAlive = ev.attackerUnits.some((u) => u.alive);
  const score = `Punteggio: ${pyStr(normalizeScore(ev.score))}`;
  const buffs = ev.buffAbilityIds.map(buffLabel);
  const attacker = teamRow(ev.attackerUnits, ev.attackerMow);
  const defender = teamRow(ev.defenderUnits, ev.defenderMow);
  const outcome = cardOutcome(ev, anyAttackerAlive, tab);
  return { key: `${index}`, timestamp, zone, score, anyAttackerAlive, outcome, buffs, attacker, defender };
}

/**
 * Costruisce le card dalla piu' recente alla meno recente.
 * Se una card solleva un'eccezione, restano visibili quelle gia' create (come in Tk).
 */
export function buildCards(pb: PlayerBattles, tab: Tab = 'attack'): CardView[] {
  const cards: CardView[] = [];
  const reversed = [...pb.battles].reverse();
  try {
    reversed.forEach((ev, i) => cards.push(buildCard(ev, i, tab)));
  } catch (e) {
    console.error(e);
  }
  return cards;
}

