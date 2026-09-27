/**
 * Macchina a stati della dashboard (port di DashboardView._on_player_changed,
 * _load_player e _render_cards), indipendente da React.
 */

import { buildCards, collectApiIds, countLabel, PLACEHOLDER, type CardView, type DashboardModel } from './dashboard';
import type { PlayerBattles } from './models';
import { fetchAll, isCached } from './portraits';

export type Content =
  | { kind: 'placeholder' }
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'cards'; cards: CardView[] };

export interface DashboardState {
  /** Valore mostrato nel menu a tendina */
  selected: string;
  /** Testo dell'etichetta contatore */
  count: string;
  /** Contenuto dell'area scrollabile */
  content: Content;
}

export class DashboardController {
  state: DashboardState = { selected: PLACEHOLDER, count: '', content: { kind: 'placeholder' } };
  private currentPlayer = '';
  /** Promesse dei caricamenti in corso (utile per i test). */
  pending: Promise<void>[] = [];

  constructor(
    private readonly model: DashboardModel,
    private readonly onChange: (state: DashboardState) => void = () => {},
  ) {}

  private set(patch: Partial<DashboardState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  private showPlaceholderMessage() {
    this.set({ count: '', content: { kind: 'placeholder' } });
  }

  onPlayerChanged(name: string): void {
    this.set({ selected: name });
    if (name === PLACEHOLDER) {
      this.currentPlayer = '';
      this.showPlaceholderMessage();
    } else {
      try {
        this.loadPlayer(name);
      } catch (e) {
        // L'originale solleva l'eccezione nel callback Tk: la vista resta com'e'
        console.error(e);
      }
    }
  }

  private loadPlayer(name: string): void {
    this.set({ content: { kind: 'empty' } });

    const uid = this.model.nameToUid.get(name);
    if (!uid) return;
    const pb = this.model.battles.get(uid);
    if (!pb) return;

    this.currentPlayer = name;

    this.set({ count: countLabel(pb) });

    // Raccogli tutti gli api_id necessari per questo giocatore
    const apiIds = collectApiIds(pb);
    const toFetch = [...apiIds].filter((aid) => !isCached(aid));

    if (toFetch.length > 0) {
      this.set({ content: { kind: 'loading' } });
      const snapshot = name;
      this.pending.push(fetchAll(toFetch).then(() => this.renderCards(pb, snapshot)));
    } else {
      this.renderCards(pb, name);
    }
  }

  private renderCards(pb: PlayerBattles, expectedPlayer: string): void {
    if (this.currentPlayer !== expectedPlayer) return;
    this.set({ content: { kind: 'cards', cards: buildCards(pb) } });
  }
}
