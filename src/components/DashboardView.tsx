/** Dashboard mostrata dopo l'import di un report di guerra valido (port di gui/dashboard_view.py). */

import { useState } from 'react';
import { DashboardController, type DashboardState } from '../core/controller';
import type { DashboardModel, Tab } from '../core/dashboard';
import { BattleCard } from './BattleCard';
import { Emblem } from './Emblem';
import { Title } from './Title';

const TABS: { id: Tab; label: string }[] = [
  { id: 'attack', label: 'Attacco' },
  { id: 'defense', label: 'Difesa' },
];

export function DashboardView({ model }: { model: DashboardModel }) {
  const [controller] = useState(() => new DashboardController(model, (s) => setState(s)));
  const [state, setState] = useState<DashboardState>(controller.state);
  const { selected, tab, tabCounts, count, content } = state;

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
        {tabCounts && (
          <div className="tabs" role="tablist" aria-label="Tipo di battaglie">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="battle-panel"
                className={`tab${tab === t.id ? ' is-active' : ''}`}
                onClick={() => controller.onTabChanged(t.id)}
              >
                {t.label}
                <span className="tab-count">{tabCounts[t.id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <section
        className="scroll-area panel"
        aria-live="polite"
        id="battle-panel"
        role={tabCounts ? 'tabpanel' : undefined}
        aria-labelledby={tabCounts ? `tab-${tab}` : undefined}
      >
        {content.kind === 'placeholder' && (
          <p className="scroll-message">Selezionare un giocatore per visualizzare le stats</p>
        )}
        {content.kind === 'loading' && (
          <div className="scroll-message loading">
            <span className="spinner" aria-hidden="true" />
            Caricamento dati...
          </div>
        )}
        {content.kind === 'cards' && content.cards.length === 0 && (
          <p className="scroll-message">
            {tab === 'attack' ? 'Nessun attacco effettuato' : 'Nessun attacco subito'}
          </p>
        )}
        {content.kind === 'cards' && content.cards.length > 0 && (
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
