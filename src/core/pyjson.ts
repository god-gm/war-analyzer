/**
 * Porting fedele di `json.loads` di CPython (modulo `json` + scanner C `_json`).
 *
 * Replica: messaggi di errore di `JSONDecodeError` (con riga, colonna e
 * posizione in code point), accettazione di NaN / Infinity / -Infinity,
 * distinzione int / float, limite di 4300 cifre per gli interi.
 */

import { PyFloat, type PyDict, type PyValue } from './pyvalue';

export class JSONDecodeError extends Error {
  constructor(msg: string, doc: Uint32Array, pos: number) {
    let lineno = 1;
    let lastNl = -1;
    for (let i = 0; i < pos; i++) {
      if (doc[i] === 0x0a) {
        lineno++;
        lastNl = i;
      }
    }
    const colno = pos - lastNl;
    super(`${msg}: line ${lineno} column ${colno} (char ${pos})`);
    this.name = 'JSONDecodeError';
  }
}

/** Errori non-JSONDecodeError sollevati da json.loads (es. ValueError sulle cifre). */
export class PyJsonValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

class StopIteration {
  constructor(public readonly value: number) {}
}

const INT_MAX_STR_DIGITS = 4300;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;

const isWs = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;

function toCodePoints(s: string): Uint32Array {
  const out = new Uint32Array(s.length);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        out[n++] = ((c - 0xd800) << 10) + (d - 0xdc00) + 0x10000;
        i++;
        continue;
      }
    }
    out[n++] = c;
  }
  return out.subarray(0, n);
}

function fromCodePoints(s: Uint32Array, start: number, end: number): string {
  let out = '';
  const CHUNK = 8192;
  for (let i = start; i < end; i += CHUNK) {
    out += String.fromCodePoint(...s.subarray(i, Math.min(end, i + CHUNK)));
  }
  return out;
}

function matchesAscii(s: Uint32Array, idx: number, word: string): boolean {
  for (let i = 0; i < word.length; i++) {
    if (s[idx + i] !== word.charCodeAt(i)) return false;
  }
  return true;
}

class Scanner {
  private readonly len: number;

  constructor(private readonly s: Uint32Array) {
    this.len = s.length;
  }

  private err(msg: string, pos: number): never {
    throw new JSONDecodeError(msg, this.s, pos);
  }

  scanOnce(idx: number): [PyValue, number] {
    const s = this.s;
    const length = this.len;
    if (idx >= length) throw new StopIteration(idx);
    switch (s[idx]) {
      case QUOTE:
        return this.scanString(idx + 1);
      case 0x7b: // {
        return this.parseObject(idx + 1);
      case 0x5b: // [
        return this.parseArray(idx + 1);
      case 0x6e: // n
        if (idx + 3 < length && matchesAscii(s, idx, 'null')) return [null, idx + 4];
        break;
      case 0x74: // t
        if (idx + 3 < length && matchesAscii(s, idx, 'true')) return [true, idx + 4];
        break;
      case 0x66: // f
        if (idx + 4 < length && matchesAscii(s, idx, 'false')) return [false, idx + 5];
        break;
      case 0x4e: // N
        if (idx + 2 < length && matchesAscii(s, idx, 'NaN')) return [new PyFloat(NaN), idx + 3];
        break;
      case 0x49: // I
        if (idx + 7 < length && matchesAscii(s, idx, 'Infinity')) {
          return [new PyFloat(Infinity), idx + 8];
        }
        break;
      case 0x2d: // -
        if (idx + 8 < length && matchesAscii(s, idx, '-Infinity')) {
          return [new PyFloat(-Infinity), idx + 9];
        }
        break;
    }
    return this.matchNumber(idx);
  }

  private matchNumber(start: number): [PyValue, number] {
    const s = this.s;
    const endIdx = this.len - 1;
    let idx = start;
    let isFloat = false;

    if (s[idx] === 0x2d) {
      idx++;
      if (idx > endIdx) throw new StopIteration(start);
    }
    if (s[idx] >= 0x31 && s[idx] <= 0x39) {
      idx++;
      while (idx <= endIdx && isDigit(s[idx])) idx++;
    } else if (s[idx] === 0x30) {
      idx++;
    } else {
      throw new StopIteration(start);
    }
    if (idx < endIdx && s[idx] === 0x2e && isDigit(s[idx + 1])) {
      isFloat = true;
      idx += 2;
      while (idx <= endIdx && isDigit(s[idx])) idx++;
    }
    if (idx < endIdx && (s[idx] === 0x65 || s[idx] === 0x45)) {
      const eStart = idx;
      idx++;
      if (idx < endIdx && (s[idx] === 0x2d || s[idx] === 0x2b)) idx++;
      while (idx <= endIdx && isDigit(s[idx])) idx++;
      if (isDigit(s[idx - 1])) isFloat = true;
      else idx = eStart;
    }
    const text = fromCodePoints(s, start, idx);
    if (isFloat) return [new PyFloat(Number(text)), idx];
    const digits = text.startsWith('-') ? text.length - 1 : text.length;
    if (digits > INT_MAX_STR_DIGITS) {
      throw new PyJsonValueError(
        `Exceeds the limit (${INT_MAX_STR_DIGITS} digits) for integer string conversion: ` +
          `value has ${digits} digits; use sys.set_int_max_str_digits() to increase the limit`,
      );
    }
    const big = BigInt(text);
    const n = Number(big);
    return [Number.isSafeInteger(n) ? n : big, idx];
  }

  scanString(end: number): [string, number] {
    const s = this.s;
    const len = this.len;
    const begin = end - 1;
    let out = '';
    for (;;) {
      let c = 0;
      let next: number;
      for (next = end; next < len; next++) {
        c = s[next];
        if (c === QUOTE || c === BACKSLASH) break;
        if (c <= 0x1f) this.err('Invalid control character at', next);
      }
      if (c !== QUOTE && c !== BACKSLASH) this.err('Unterminated string starting at', begin);
      if (next !== end) out += fromCodePoints(s, end, next);
      next++;
      if (c === QUOTE) {
        end = next;
        break;
      }
      if (next === len) this.err('Unterminated string starting at', begin);
      c = s[next];
      if (c !== 0x75) {
        end = next + 1;
        switch (c) {
          case QUOTE:
          case BACKSLASH:
          case 0x2f:
            break;
          case 0x62: c = 0x08; break;
          case 0x66: c = 0x0c; break;
          case 0x6e: c = 0x0a; break;
          case 0x72: c = 0x0d; break;
          case 0x74: c = 0x09; break;
          default:
            c = 0;
        }
        if (c === 0) this.err('Invalid \\escape', end - 2);
      } else {
        c = 0;
        next++;
        end = next + 4;
        if (end >= len) this.err('Invalid \\uXXXX escape', next - 1);
        for (; next < end; next++) {
          const h = hexVal(s[next]);
          if (h < 0) this.err('Invalid \\uXXXX escape', end - 5);
          c = (c << 4) | h;
        }
        if (c >= 0xd800 && c <= 0xdbff && end + 6 < len && s[next++] === BACKSLASH && s[next++] === 0x75) {
          let c2 = 0;
          end += 6;
          for (; next < end; next++) {
            const h = hexVal(s[next]);
            if (h < 0) this.err('Invalid \\uXXXX escape', end - 5);
            c2 = (c2 << 4) | h;
          }
          if (c2 >= 0xdc00 && c2 <= 0xdfff) {
            c = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
          } else {
            end -= 6;
          }
        }
      }
      out += c > 0xffff ? String.fromCodePoint(c) : String.fromCharCode(c);
    }
    return [out, end];
  }

  private skipWs(idx: number): number {
    while (idx < this.len && isWs(this.s[idx])) idx++;
    return idx;
  }

  private parseObject(idx: number): [PyDict, number] {
    const s = this.s;
    const endIdx = this.len - 1;
    const obj: PyDict = new Map();
    idx = this.skipWs(idx);
    if (idx > endIdx || s[idx] !== 0x7d) {
      for (;;) {
        if (idx > endIdx || s[idx] !== QUOTE) {
          this.err('Expecting property name enclosed in double quotes', idx);
        }
        const [key, afterKey] = this.scanString(idx + 1);
        idx = this.skipWs(afterKey);
        if (idx > endIdx || s[idx] !== 0x3a) this.err("Expecting ':' delimiter", idx);
        idx = this.skipWs(idx + 1);
        const [val, afterVal] = this.scanOnce(idx);
        // In un dict Python la chiave duplicata mantiene la posizione originale
        obj.set(key, val);
        idx = this.skipWs(afterVal);
        if (idx <= endIdx && s[idx] === 0x7d) break;
        if (idx > endIdx || s[idx] !== 0x2c) this.err("Expecting ',' delimiter", idx);
        const commaIdx = idx;
        idx = this.skipWs(idx + 1);
        if (idx <= endIdx && s[idx] === 0x7d) {
          this.err('Illegal trailing comma before end of object', commaIdx);
        }
      }
    }
    return [obj, idx + 1];
  }

  private parseArray(idx: number): [PyValue[], number] {
    const s = this.s;
    const endIdx = this.len - 1;
    const arr: PyValue[] = [];
    idx = this.skipWs(idx);
    if (idx > endIdx || s[idx] !== 0x5d) {
      for (;;) {
        const [val, afterVal] = this.scanOnce(idx);
        arr.push(val);
        idx = this.skipWs(afterVal);
        if (idx <= endIdx && s[idx] === 0x5d) break;
        if (idx > endIdx || s[idx] !== 0x2c) this.err("Expecting ',' delimiter", idx);
        const commaIdx = idx;
        idx = this.skipWs(idx + 1);
        if (idx <= endIdx && s[idx] === 0x5d) {
          this.err('Illegal trailing comma before end of array', commaIdx);
        }
      }
    }
    return [arr, idx + 1];
  }
}

function hexVal(c: number): number {
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  if (c >= 0x61 && c <= 0x66) return c - 0x61 + 10;
  if (c >= 0x41 && c <= 0x46) return c - 0x41 + 10;
  return -1;
}

/** Equivalente di `json.loads(s)` per una stringa. */
export function pyJsonLoads(text: string): PyValue {
  const s = toCodePoints(text);
  if (s.length > 0 && s[0] === 0xfeff) {
    throw new JSONDecodeError('Unexpected UTF-8 BOM (decode using utf-8-sig)', s, 0);
  }
  const scanner = new Scanner(s);
  let idx = 0;
  while (idx < s.length && isWs(s[idx])) idx++;
  let obj: PyValue;
  let end: number;
  try {
    [obj, end] = scanner.scanOnce(idx);
  } catch (e) {
    if (e instanceof StopIteration) throw new JSONDecodeError('Expecting value', s, e.value);
    throw e;
  }
  while (end < s.length && isWs(s[end])) end++;
  if (end !== s.length) throw new JSONDecodeError('Extra data', s, end);
  return obj;
}
