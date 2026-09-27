/** Modelli dati per i report di guerra di gilda importati (port di core/models.py). */

import type { PyDict, PyValue } from './pyvalue';

/** Rappresenta un file di report di guerra importato e validato. */
export interface WarReport {
  fileName: string;
  rawData: PyDict;
}

export interface UnitEntry {
  unitId: PyValue;
  /** remainingHPAfter presente e > 0 */
  alive: boolean;
  /** False solo per difensori con remainingHPBefore assente/0 */
  hadHpBefore: boolean;
}

export interface MachineOfWar {
  unitId: PyValue;
}

export interface BattleEvent {
  battleId: PyValue;
  createdOnMs: PyValue;
  zoneType: PyValue;
  zoneVisualId: PyValue;
  score: PyValue;
  attackerUserId: string;
  attackerUnits: UnitEntry[];
  attackerMow: MachineOfWar | null;
  defenderUserId: PyValue;
  defenderUnits: UnitEntry[];
  defenderMow: MachineOfWar | null;
  buffAbilityIds: PyValue[];
}

export interface PlayerBattles {
  userId: string;
  displayName: PyValue;
  battles: BattleEvent[];
}
