/** Card di una singola battaglia (port di _BattleCard / _TeamRow / _unit_widget). */

import type { CardView, TeamView, UnitView } from '../core/dashboard';
import { UnitPortrait } from './UnitPortrait';

function Unit({ unit }: { unit: UnitView }) {
  if (unit.kind === 'image') return <UnitPortrait unit={unit} />;
  return <span className={`unit-text tone-${unit.tone}`}>{unit.text}</span>;
}

function TeamRow({ label, team, side }: { label: string; team: TeamView; side: 'attacker' | 'defender' }) {
  return (
    <div className={`team-row team-${side}`}>
      <span className="row-label">{label}</span>
      <div className="units">
        {team.units.map((u, i) => (
          <Unit key={i} unit={u} />
        ))}
        {team.mow && (
          <>
            <span className="mow-sep" aria-hidden="true">
              |
            </span>
            <Unit unit={team.mow} />
          </>
        )}
      </div>
    </div>
  );
}

export function BattleCard({ card }: { card: CardView }) {
  return (
    <article className={`battle-card ${card.success ? 'is-win' : 'is-loss'}`}>
      <header className="card-header">
        <span className="card-date">{card.timestamp}</span>
        <span className="card-zone">{card.zone}</span>
        <span className={`card-score ${card.success ? 'score-ok' : 'score-ko'}`}>{card.score}</span>
      </header>

      {card.buffs.length > 0 && (
        <div className="buffs-row">
          <span className="row-label">Potenziamenti:</span>
          <div className="buffs">
            {card.buffs.map((b, i) => (
              <span key={i} className="buff-chip">
                {b}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card-sep" />

      <TeamRow label="Attaccante:" team={card.attacker} side="attacker" />
      <TeamRow label="Difensore:" team={card.defender} side="defender" />
    </article>
  );
}
