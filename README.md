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

## Pubblicazione

Il workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) esegue test e
build e pubblica `dist/` su GitHub Pages a ogni push su `develop`.
