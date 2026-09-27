/** Parsing e validazione dei file di export delle guerre di gilda (port di core/parser.py). */

import type { BattleEvent, MachineOfWar, PlayerBattles, UnitEntry, WarReport } from './models';
import { JSONDecodeError, pyJsonLoads } from './pyjson';
import {
  assertHashable,
  isDict,
  pyEq,
  pyGet,
  pyGt,
  pyIter,
  pyOr,
  pySortCmp,
  pyTruthy,
  strHead,
  PyError,
  type PyValue,
} from './pyvalue';
import { readTextUtf8 } from './textfile';

export const REQUIRED_ROOT_KEY = 'eventResults';
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Sollevata quando il file selezionato non e' un report valido. */
export class WarReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WarReportParseError';
  }
}

/** Legge e valida un file di export della guerra di gilda. */
export async function loadWarReport(file: File): Promise<WarReport> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new WarReportParseError('Il file selezionato supera la dimensione massima consentita (10 MB).');
  }

  let content: string;
  try {
    content = readTextUtf8(new Uint8Array(await file.arrayBuffer()));
  } catch (exc) {
    throw new WarReportParseError(`Impossibile leggere il file: ${(exc as Error).message}`);
  }

  return parseWarReport(file.name, content);
}

/** Validazione del contenuto testuale gia' letto. */
export function parseWarReport(fileName: string, content: string): WarReport {
  let data: PyValue;
  try {
    data = pyJsonLoads(content);
  } catch (exc) {
    if (exc instanceof JSONDecodeError) {
      throw new WarReportParseError(`Il file non contiene un JSON valido: ${exc.message}`);
    }
    throw exc;
  }

  if (!isDict(data) || !data.has(REQUIRED_ROOT_KEY)) {
    throw new WarReportParseError(
      'Il file non sembra un export valido dei dati di guerra ' +
        `(manca la chiave '${REQUIRED_ROOT_KEY}').`,
    );
  }

  return { fileName, rawData: data };
}

function parseAttackerUnit(raw: PyValue): UnitEntry {
  const remaining = pyGet(raw, 'remainingHPAfter');
  const alive = remaining !== null && pyGt(remaining, 0);
  return { unitId: pyGet(raw, 'unitId', 'unknown'), alive, hadHpBefore: true };
}

function parseDefenderUnit(raw: PyValue): UnitEntry {
  const remainingAfter = pyGet(raw, 'remainingHPAfter');
  const alive = remainingAfter !== null && pyGt(remainingAfter, 0);
  const remainingBefore = pyGet(raw, 'remainingHPBefore');
  const hadHpBefore = remainingBefore !== null && pyGt(remainingBefore, 0);
  return { unitId: pyGet(raw, 'unitId', 'unknown'), alive, hadHpBefore };
}

function parseMow(raw: PyValue): MachineOfWar | null {
  if (!pyTruthy(raw)) return null;
  return { unitId: pyGet(raw, 'unitId', 'unknown') };
}

/** Restituisce il teamIndex della gilda con il nome indicato, o null. */
export function findGuildTeamIndex(report: WarReport, guildName: string): PyValue {
  for (const er of pyIter(pyGet(report.rawData, 'eventResults', []))) {
    for (const g of pyIter(pyGet(pyGet(er, 'eventResponseData', new Map()), 'guildData', []))) {
      if (pyEq(pyGet(g, 'name'), guildName)) {
        return pyGet(g, 'teamIndex');
      }
    }
  }
  return null;
}

/**
 * Estrae e raggruppa i battleFinished per attacker.userId.
 *
 * Se `teamIndex` e' fornito, vengono inclusi solo gli eventi il cui
 * campo `teamIndex` corrisponde al valore indicato.
 *
 * Il risultato mantiene l'ordine di inserimento (come il dict Python).
 */
export function extractBattles(report: WarReport, teamIndex: PyValue = null): Map<string, PlayerBattles> {
  const raw = report.rawData;

  // userId -> displayName da playerData
  const playerNames = new Map<string, PyValue>();
  for (const er of pyIter(pyGet(raw, 'eventResults', []))) {
    for (const p of pyIter(pyGet(pyGet(er, 'eventResponseData', new Map()), 'playerData', []))) {
      const uid = pyGet(p, 'userId');
      if (pyTruthy(uid)) {
        const name = pyOr(pyGet(p, 'displayName'), () => uid);
        assertHashable(uid);
        // Chiavi non stringa non possono mai coincidere con un attacker userId (sempre str)
        if (typeof uid === 'string') playerNames.set(uid, name);
      }
    }
  }

  const battlesByPlayer = new Map<string, BattleEvent[]>();

  for (const er of pyIter(pyGet(raw, 'eventResults', []))) {
    const logs = pyGet(pyGet(er, 'eventResponseData', new Map()), 'activityLogs', []);
    for (const log of pyIter(logs)) {
      if (!pyEq(pyGet(log, 'type'), 'battleFinished')) continue;

      if (teamIndex !== null && !pyEq(pyGet(log, 'teamIndex'), teamIndex)) continue;

      const attacker = pyOr(pyGet(log, 'attacker'), () => new Map());
      const defender = pyOr(pyGet(log, 'defender'), () => new Map());
      const zone = pyOr(pyGet(log, 'zone'), () => new Map());
      const buffs = pyOr(pyGet(log, 'buffs'), () => []);

      const attackerUid = pyOr(pyGet(attacker, 'userId'), () => pyGet(log, 'userId'));
      if (!pyTruthy(attackerUid)) continue;

      const event: BattleEvent = {
        battleId: pyGet(log, 'id', ''),
        createdOnMs: pyGet(log, 'createdOn', 0),
        zoneType: pyGet(zone, 'type', ''),
        zoneVisualId: pyGet(zone, 'visualId', ''),
        score: pyGet(log, 'score', 0),
        attackerUserId: attackerUid as string,
        attackerUnits: pyIter(pyOr(pyGet(attacker, 'units'), () => [])).map(parseAttackerUnit),
        attackerMow: parseMow(pyGet(attacker, 'machineOfWar')),
        defenderUserId: pyGet(defender, 'userId'),
        defenderUnits: pyIter(pyOr(pyGet(defender, 'units'), () => [])).map(parseDefenderUnit),
        defenderMow: parseMow(pyGet(defender, 'machineOfWar')),
        buffAbilityIds: pyIter(buffs)
          .filter((b) => pyTruthy(pyGet(b, 'abilityId')))
          .map((b) => pyGet(b, 'abilityId')),
      };

      // battles_by_player.setdefault(attacker_uid, ...) richiede una chiave hashable
      assertHashable(attackerUid);
      if (typeof attackerUid !== 'string') {
        // Python: uid[:8] su un valore non stringa solleva TypeError
        throw new PyError('TypeError', `'${typeof attackerUid}' object is not subscriptable`);
      }
      const list = battlesByPlayer.get(attackerUid);
      if (list) list.push(event);
      else battlesByPlayer.set(attackerUid, [event]);
    }
  }

  const result = new Map<string, PlayerBattles>();
  for (const [uid, battles] of battlesByPlayer) {
    battles.sort((a, b) => pySortCmp(a.createdOnMs, b.createdOnMs));
    // Nomi unici: se collisione aggiungo suffisso con short uid
    const name = playerNames.has(uid) ? (playerNames.get(uid) as PyValue) : strHead(uid, 8);
    result.set(uid, { userId: uid, displayName: name, battles });
  }

  return result;
}
