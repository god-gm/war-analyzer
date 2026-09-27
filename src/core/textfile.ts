/**
 * Equivalente di `Path.read_text(encoding="utf-8")`:
 * decodifica UTF-8 stretta (con i messaggi di `UnicodeDecodeError` di CPython)
 * e traduzione universale dei fine riga (\r\n e \r -> \n).
 */

export class UnicodeDecodeError extends Error {
  constructor(bytes: Uint8Array, start: number, end: number, reason: string) {
    const msg =
      end - start === 1
        ? `'utf-8' codec can't decode byte 0x${bytes[start].toString(16).padStart(2, '0')} in position ${start}: ${reason}`
        : `'utf-8' codec can't decode bytes in position ${start}-${end - 1}: ${reason}`;
    super(msg);
    this.name = 'UnicodeDecodeError';
  }
}

/** Trova il primo errore di decodifica, replicando le regole del decoder CPython. */
function findUtf8Error(b: Uint8Array): UnicodeDecodeError | null {
  const n = b.length;
  let i = 0;
  while (i < n) {
    const c = b[i];
    if (c < 0x80) {
      i++;
      continue;
    }
    let need: number;
    let lo = 0x80;
    let hi = 0xbf;
    if (c >= 0xc2 && c <= 0xdf) need = 1;
    else if (c >= 0xe0 && c <= 0xef) {
      need = 2;
      if (c === 0xe0) lo = 0xa0;
      else if (c === 0xed) hi = 0x9f;
    } else if (c >= 0xf0 && c <= 0xf4) {
      need = 3;
      if (c === 0xf0) lo = 0x90;
      else if (c === 0xf4) hi = 0x8f;
    } else {
      return new UnicodeDecodeError(b, i, i + 1, 'invalid start byte');
    }
    let j = 1;
    for (; j <= need; j++) {
      if (i + j >= n) return new UnicodeDecodeError(b, i, n, 'unexpected end of data');
      const cc = b[i + j];
      const l = j === 1 ? lo : 0x80;
      const h = j === 1 ? hi : 0xbf;
      if (cc < l || cc > h) return new UnicodeDecodeError(b, i, i + j, 'invalid continuation byte');
    }
    i += need + 1;
  }
  return null;
}

export function readTextUtf8(bytes: Uint8Array): string {
  const err = findUtf8Error(bytes);
  if (err) throw err;
  // ignoreBOM: il codec 'utf-8' (non 'utf-8-sig') conserva il BOM
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  return text.replace(/\r\n?/g, '\n');
}
