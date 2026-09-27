/**
 * Macchina a stati della dashboard (port di DashboardView._on_player_changed,
 * _load_player e _render_cards), indipendente da React.
 */

import {
  buildCards,
  collectApiIds,
  countLabel,
  defenseCountLabel,
  PLACEHOLDER,
  type CardView,
  type DashboardModel,
  type Tab,
} from './dashboard';
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
  /** Tab attiva (resta la stessa quando si cambia giocatore) */
  tab: Tab;
  /** Numero di battaglie per tab del giocatore selezionato; null = tab nascoste */
  tabCounts: Record<Tab, number> | null;
  /** Testo dell'etichetta contatore */
  count: string;
  /** Contenuto dell'area scrollabile */
  content: Content;
}

export class DashboardController {
  state: DashboardState = {
    selected: PLACEHOLDER,
    tab: 'attack',
    tabCounts: null,
    count: '',
    content: { kind: 'placeholder' },
  };
  private currentPlayer = '';
  /** Battaglie del giocatore corrente per ciascuna tab */
  private current: Record<Tab, PlayerBattles> | null = null;
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
    this.set({ count: '', tabCounts: null, content: { kind: 'placeholder' } });
  }

  onPlayerChanged(name: string): void {
    this.set({ selected: name });
    if (name === PLACEHOLDER) {
      this.currentPlayer = '';
      this.current = null;
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

  onTabChanged(tab: Tab): void {
    if (tab === this.state.tab) return;
    this.set({ tab });
    if (!this.current) return;
    try {
      this.showTab();
    } catch (e) {
      console.error(e);
    }
  }

  private loadPlayer(name: string): void {
    this.current = null;
    this.set({ tabCounts: null, content: { kind: 'empty' } });

    const uid = this.model.nameToUid.get(name);
    if (!uid) return;
    const attack = this.model.battles.get(uid);
    const defense = this.model.defenses.get(uid);
    if (!attack && !defense) return;

    const empty = (pb: PlayerBattles): PlayerBattles => ({ ...pb, battles: [] });
    this.current = {
      attack: attack ?? empty(defense as PlayerBattles),
      defense: defense ?? empty(attack as PlayerBattles),
    };
    this.currentPlayer = name;
    this.set({
      tabCounts: { attack: this.current.attack.battles.length, defense: this.current.defense.battles.length },
    });
    this.showTab();
  }

  private showTab(): void {
    const tab = this.state.tab;
    const pb = (this.current as Record<Tab, PlayerBattles>)[tab];

    this.set({ count: tab === 'attack' ? countLabel(pb) : defenseCountLabel(pb), content: { kind: 'empty' } });

    // Raccogli tutti gli api_id necessari per questo giocatore
    const apiIds = collectApiIds(pb);
    const toFetch = [...apiIds].filter((aid) => !isCached(aid));

    const snapshot = this.currentPlayer;
    if (toFetch.length > 0) {
      this.set({ content: { kind: 'loading' } });
      this.pending.push(fetchAll(toFetch).then(() => this.renderCards(pb, snapshot, tab)));
    } else {
      this.renderCards(pb, snapshot, tab);
    }
  }

  private renderCards(pb: PlayerBattles, expectedPlayer: string, expectedTab: Tab): void {
    if (this.currentPlayer !== expectedPlayer || this.state.tab !== expectedTab) return;
    this.set({ content: { kind: 'cards', cards: buildCards(pb, expectedTab) } });
  }
}
