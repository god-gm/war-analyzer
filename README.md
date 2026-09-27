# Ordo Malleus - War Stats Analyzer (web)

SPA React che replica il comportamento dell'app desktop Python (cartella locale
`python_original/`, non versionata): analisi dei file di export delle guerre di gilda
di Warhammer 40,000: Tacticus. Pubblicata su GitHub Pages.

Il file viene elaborato interamente nel browser: nessun dato viene inviato a server
(i ritratti delle unità sono caricati dalla CDN di Snowprint come nell'originale).

## Sviluppo

```bash
npm install
npm run dev       # server di sviluppo
npm test          # test di equivalenza con l'originale Python
npm run build     # build di produzione in dist/
npm run preview   # anteprima della build
```

## Struttura

```
src/
├── core/                 # logica, porting 1:1 del Python
│   ├── pyvalue.ts        # semantica dei valori Python (truthiness, ==, <, str, {:,} ...)
│   ├── pyjson.ts         # json.loads di CPython (stessi messaggi di errore)
│   ├── textfile.ts       # Path.read_text(encoding="utf-8")
│   ├── parser.ts         # core/parser.py
│   ├── models.ts         # core/models.py
│   ├── format.ts         # helper di gui/dashboard_view.py
│   ├── dashboard.ts      # DashboardView / _BattleCard (modello)
│   ├── controller.ts     # selezione giocatore, caricamento, render card
│   └── portraits.ts      # _fetch_pil + cache ritratti
└── components/           # interfaccia React
tests/
├── equivalence.test.ts   # confronta la SPA con i golden generati dal Python
├── fixtures/             # golden + copia del file di esempio (sample_b1.json)
└── tools/generate_golden.py
```

## Rigenerare i golden

Serve la cartella locale `python_original/`. I golden sono prodotti eseguendo il
codice Python originale (customtkinter viene
sostituito da uno stub; serve Pillow perché il modulo originale lo importa):

```bash
python -m venv .venv && . .venv/bin/activate && pip install pillow tzdata
python tests/tools/generate_golden.py
```

## Mappe delle battaglie

Il report di guerra non indica su quale mappa si combatte: la mappa di ogni zona
dipende da stagione e round della guerra. La tabella zona → mappa è in
[`src/data/war_maps.json`](src/data/war_maps.json), con chiave `"<stagione>.<round>"`:

```json
{ "27.4": { "HQ": "LHE_Desert_03", "Trenches1": "C1_15", ... } }
```

L'immagine di una mappa è `https://cdn.ezekiel.snowprintstudios.com/<codice>_Visual.png`.

### Aggiungere un round

La tabella si ricava dalla pagina di anteprima di tacticus.xyz, che è protetta da
Cloudflare e va quindi salvata a mano dal browser:

1. Aprire `https://www.tacticus.xyz/wars/preview/maps?battle=<round>&season=<stagione>`
   (es. `battle=4&season=27`).
2. Salvare la pagina con **Ctrl+S** ("Solo HTML" è sufficiente) in una cartella del
   progetto, ad esempio `python_original/sample/`.
3. Lanciare lo script (serve Python 3.9+, nessuna dipendenza):

   ```bash
   npm run maps:import -- python_original/sample/<pagina>.html
   # oppure direttamente
   python3 scripts/import_maps.py python_original/sample/<pagina>.html
   ```

Lo script legge stagione e round dal titolo della pagina ("Season 27.4 - Map Preview"),
estrae le 15 zone e aggiorna il JSON, stampando cosa è cambiato. Si possono passare
più pagine insieme. Opzioni:

- `--dry-run`: mostra il risultato senza scrivere il file;
- `--force`: importa anche se mancano zone o ne compaiono di sconosciute (di norma
  lo script si ferma e non modifica nulla);
- `--out <file>`: scrive su un altro file JSON.

Se il file salvato è la pagina "Just a moment..." di Cloudflare, lo script lo segnala:
bisogna aprire la pagina nel browser, attendere il caricamento e salvarla di nuovo.

## Pubblicazione

Il workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) esegue test e
build e pubblica `dist/` su GitHub Pages a ogni push su `develop`.
