/** Helper di formattazione della dashboard (port degli helper di gui/dashboard_view.py). */

import { PyError, pyGe, pyLe, pySub, pyTrueDiv, typeName, type PyValue } from './pyvalue';

export const HOME_GUILD = '[ITA] Ordo Malleus';

/** Prefissi che differiscono tra game ID e CDN ID */
const PREFIX_MAP = new Map<string, string>([
  ['eldar', 'aelda'],
  ['orks', 'orkss'],
  ['tau', 'tauta'],
]);

/** Eccezioni con suffissi o nomi completamente diversi */
const ID_OVERRIDES = new Map<string, string>([
  ['ultraEliminatorSgt', 'ultra_eliminator'],
  ['ultraInceptorSgt', 'ultra_inceptor'],
  ['thousInfernalMaster', 'thous_infernal'],
  ['custoVexilusPraetor', 'custo_vexilus'],
  ['templNpc1Initiate', 'templ_initiate'],
  ['templSwordBrother', 'templ_brother'],
  ['astraPrimarisPsy', 'astra_psyker'],
  ['orksBigMek', 'orkss_mek'],
  ['orksRukkatrukk', 'orkss_rukkatruk'],
  ['eldarMauganRa', 'aelda_maugan'],
  // Space Wolves: nomi propri differenti
  ['spaceBlackmane', 'space_ragnar'],
  ['spaceRockfist', 'space_arjac'],
  ['spaceStormcaller', 'space_njal'],
  // Emperor's Children
  ['emperFlawlessBlade', 'emper_lucius'],
  // Necron
  ['necroDestroyer', 'necro_hexmark'],
]);

/** Decodifica buff abilityId -> label leggibile */
export const BUFF_LABELS = new Map<string, string>([
  ['EnvAngelsOfDeath', 'Piattaforma Atterraggio'],
  ['EnvArmourSupplies', 'Arsenale'],
  ['EnvArtillerySupport', 'Artiglieria'],
  ['EnvDefenderHealthBuff2', 'Medica'],
  ['EnvFlakFire', 'Antiaerea'],
  ['EnvFortified', 'Fortificata'],
]);

// Score
const BUILDING_BONUSES = [40000, 30000, 16000, 10000];
const MAX_BATTLE_SCORE = 1601;

export function normalizeScore(score: PyValue): PyValue {
  if (pyLe(score, MAX_BATTLE_SCORE)) return score;
  for (const bonus of BUILDING_BONUSES) {
    const result = pySub(score, bonus);
    if (pyGe(result, 0)) return result;
  }
  return score;
}

const ROME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** datetime.fromtimestamp(ms / 1000, tz=utc).astimezone(Europe/Rome).strftime("%d/%m/%Y %H:%M") */
export function fmtTs(ms: PyValue): string {
  const t = pyTrueDiv(ms, 1000);
  if (Number.isNaN(t)) throw new PyError('ValueError', 'Invalid value NaN (not a number)');
  if (!Number.isFinite(t)) throw new PyError('OverflowError', 'cannot convert float infinity to integer');
  // Arrotondamento ai microsecondi (ROUND_HALF_EVEN) come fa CPython
  let secs = Math.floor(t);
  const us = roundHalfEven((t - secs) * 1e6);
  if (us >= 1e6) secs += 1;
  const date = new Date(secs * 1000);
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 1 || year > 9999) {
    throw new PyError('ValueError', `year ${year} is out of range`);
  }
  const parts = Object.fromEntries(ROME_FMT.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function requireStr(v: PyValue, what: string): string {
  if (typeof v !== 'string') {
    throw new PyError('TypeError', `${what}: expected string, got '${typeName(v)}'`);
  }
  return v;
}

export function fmtZone(zoneType: PyValue): string {
  let s = requireStr(zoneType, 're.sub');
  s = s.replace(/([a-z])([A-Z])/g, '$1 $2');
  s = s.replace(/([A-Za-z])(\p{Nd})/gu, '$1 $2');
  return s;
}

/** Converte un unitId del gioco nell'ID usato dalla CDN portraits. */
export function toApiId(gameId: PyValue): string {
  if (Array.isArray(gameId) || gameId instanceof Map) {
    throw new PyError('TypeError', `unhashable type: '${typeName(gameId)}'`);
  }
  if (typeof gameId === 'string' && ID_OVERRIDES.has(gameId)) {
    return ID_OVERRIDES.get(gameId) as string;
  }
  const id = requireStr(gameId, 're.search');
  const m = /[A-Z]/.exec(id);
  if (!m) return id.toLowerCase();
  const i = m.index;
  const head = id.slice(0, i);
  const prefix = PREFIX_MAP.get(head) ?? head;
  return `${prefix}_${id.slice(i).toLowerCase()}`;
}
