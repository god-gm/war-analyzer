/** Schermata iniziale: richiesta di import del file di export della guerra (port di gui/import_view.py). */

import { useRef, useState, type DragEvent } from 'react';
import type { WarReport } from '../core/models';
import { loadWarReport, WarReportParseError } from '../core/parser';
import { Emblem } from './Emblem';
import { Title } from './Title';

interface Props {
  /** Invocato con il WarReport risultante non appena l'utente seleziona un file valido. */
  onImportSuccess: (report: WarReport) => void;
}

export function ImportView({ onImportSuccess }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  /** Valida/importa il file selezionato. */
  const importFile = async (file: File) => {
    setBusy(true);
    let report: WarReport;
    try {
      report = await loadWarReport(file);
    } catch (exc) {
      setBusy(false);
      if (exc instanceof WarReportParseError) {
        setStatus(exc.message);
      } else {
        // Eccezione non gestita dall'originale: nessun cambiamento visibile
        console.error(exc);
      }
      return;
    }
    setBusy(false);
    setStatus('');
    onImportSuccess(report);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !busy) void importFile(file);
  };

  return (
    <main
      className={`import-view${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <section className="import-panel panel">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />

        <Emblem height={150} className="import-logo" />
        <Title className="import-title" />
        <div className="rule" aria-hidden="true">
          <span />
        </div>
        <p className="import-text">
          Importa il file di export della guerra di gilda
          <br />
          di Warhammer Tacticus per iniziare l&apos;analisi.
        </p>

        <input
          ref={inputRef}
          type="file"
          hidden
          aria-label="Seleziona il file di export della guerra"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            void importFile(file);
          }}
        />
        <button type="button" className="btn-primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          <span>Seleziona file...</span>
        </button>
        <p className="drop-hint">oppure trascina qui il file</p>

        <p className="status-error" role="alert">
          {status}
        </p>
      </section>
    </main>
  );
}
