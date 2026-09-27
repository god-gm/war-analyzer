/** Dashboard mostrata dopo l'import di un report di guerra valido (port di gui/dashboard_view.py). */

import { useState } from 'react';
import { DashboardController, type DashboardState } from '../core/controller';
import type { DashboardModel } from '../core/dashboard';
import { BattleCard } from './BattleCard';
import { Emblem } from './Emblem';
import { Title } from './Title';

export function DashboardView({ model }: { model: DashboardModel }) {
  const [controller] = useState(() => new DashboardController(model, (s) => setState(s)));
  const [state, setState] = useState<DashboardState>(controller.state);
  const { selected, count, content } = state;

  return (
    <div className="dashboard">
      <header className="dash-header panel">
        <Emblem height={72} className="dash-logo" />
        <div className="dash-header-text">
          <Title as="h1" className="dash-title" />
          <p className="dash-file">File: {model.fileName}</p>
        </div>
      </header>

      <div className="controls">
        <label className="controls-label" htmlFor="player-select">
          Giocatore:
        </label>
        <div className="select-wrap">
          <select id="player-select" value={selected} onChange={(e) => controller.onPlayerChanged(e.target.value)}>
            {model.options.map((opt, i) => (
              <option key={i} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <span className="controls-count">{count}</span>
      </div>

      <section className="scroll-area panel" aria-live="polite">
        {content.kind === 'placeholder' && (
          <p className="scroll-message">Selezionare un giocatore per visualizzare le stats</p>
        )}
        {content.kind === 'loading' && (
          <div className="scroll-message loading">
            <span className="spinner" aria-hidden="true" />
            Caricamento dati...
          </div>
        )}
        {content.kind === 'cards' && (
          <div className="card-list">
            {content.cards.map((card) => (
              <BattleCard key={card.key} card={card} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
