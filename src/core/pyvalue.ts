/**
 * Rappresentazione dei valori JSON con la stessa semantica degli oggetti
 * Python prodotti da `json.loads`:
 *  - dict  -> Map (ordine di inserimento, ultima chiave duplicata vince)
 *  - list  -> Array
 *  - str   -> string
 *  - int   -> number (se rappresentabile esattamente) oppure bigint
 *  - float -> PyFloat (per distinguerlo da int, come fa Python: 1601 vs 1601.0)
 *  - bool  -> boolean
 *  - None  -> null
 */

export class PyFloat {
  constructor(public readonly value: number) {}
}

export type PyValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | PyFloat
  | PyValue[]
  | PyDict;

export type PyDict = Map<string, PyValue>;

/** Eccezione Python non gestita (TypeError, AttributeError, ...). */
export class PyError extends Error {
  constructor(
    public readonly pyType: string,
    message: string,
  ) {
    super(`${pyType}: ${message}`);
    this.name = pyType;
  }
}

export function typeName(v: unknown): string {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number' || typeof v === 'bigint') return 'int';
  if (typeof v === 'string') return 'str';
  if (v instanceof PyFloat) return 'float';
  if (Array.isArray(v)) return 'list';
  if (v instanceof Map) return 'dict';
  return 'object';
}

export const isDict = (v: PyValue): v is PyDict => v instanceof Map;

/** `obj.get(key, default)` */
export function pyGet(obj: PyValue, key: string, dflt: PyValue = null): PyValue {
  if (!isDict(obj)) {
    throw new PyError('AttributeError', `'${typeName(obj)}' object has no attribute 'get'`);
  }
  return obj.has(key) ? (obj.get(key) as PyValue) : dflt;
}

/** `bool(v)` */
export function pyTruthy(v: PyValue): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'bigint') return v !== 0n;
  if (typeof v === 'string') return v.length > 0;
  if (v instanceof PyFloat) return v.value !== 0; // NaN e' truthy in Python
  if (Array.isArray(v)) return v.length > 0;
  return v.size > 0;
}

/** `a or b` */
export function pyOr(a: PyValue, b: () => PyValue): PyValue {
  return pyTruthy(a) ? a : b();
}

/** Elementi prodotti da `for x in v`. */
export function pyIter(v: PyValue): PyValue[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return Array.from(v);
  if (isDict(v)) return Array.from(v.keys());
  throw new PyError('TypeError', `'${typeName(v)}' object is not iterable`);
}

/** Verifica che il valore sia hashable (utilizzabile come chiave di dict). */
export function assertHashable(v: PyValue): void {
  if (Array.isArray(v) || isDict(v)) {
    throw new PyError('TypeError', `unhashable type: '${typeName(v)}'`);
  }
}

// --- Numeri ------------------------------------------------------------------

type Num = { float: false; v: bigint } | { float: true; v: number };

function toNum(v: PyValue): Num | null {
  if (typeof v === 'boolean') return { float: false, v: v ? 1n : 0n };
  if (typeof v === 'number') return { float: false, v: BigInt(v) };
  if (typeof v === 'bigint') return { float: false, v };
  if (v instanceof PyFloat) return { float: true, v: v.value };
  return null;
}

function fromNum(n: Num): PyValue {
  if (n.float) return new PyFloat(n.v);
  return intValue(n.v);
}

export function intValue(v: bigint): number | bigint {
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : v;
}

function requireNum(v: PyValue, op: string, other: PyValue): Num {
  const n = toNum(v);
  if (!n) {
    throw new PyError(
      'TypeError',
      `'${op}' not supported between instances of '${typeName(v)}' and '${typeName(other)}'`,
    );
  }
  return n;
}

/** Confronto numerico: -1, 0, 1 oppure NaN se non ordinabile. */
function numCmp(a: Num, b: Num): number {
  if (!a.float && !b.float) return a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
  const x = a.float ? a.v : Number(a.v);
  const y = b.float ? b.v : Number(b.v);
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  return x < y ? -1 : x > y ? 1 : 0;
}

export function pyLe(a: PyValue, b: PyValue): boolean {
  const c = numCmp(requireNum(a, '<=', b), requireNum(b, '<=', a));
  return c <= 0;
}

export function pyGe(a: PyValue, b: PyValue): boolean {
  const c = numCmp(requireNum(a, '>=', b), requireNum(b, '>=', a));
  return c >= 0;
}

export function pyGt(a: PyValue, b: PyValue): boolean {
  const c = numCmp(requireNum(a, '>', b), requireNum(b, '>', a));
  return c > 0;
}

function arith(a: PyValue, b: PyValue, sym: string, fi: (x: bigint, y: bigint) => bigint, ff: (x: number, y: number) => number): PyValue {
  const x = toNum(a);
  const y = toNum(b);
  if (!x || !y) {
    throw new PyError(
      'TypeError',
      `unsupported operand type(s) for ${sym}: '${typeName(a)}' and '${typeName(b)}'`,
    );
  }
  if (!x.float && !y.float) return fromNum({ float: false, v: fi(x.v, y.v) });
  const fx = x.float ? x.v : Number(x.v);
  const fy = y.float ? y.v : Number(y.v);
  return fromNum({ float: true, v: ff(fx, fy) });
}

export const pyAdd = (a: PyValue, b: PyValue) => arith(a, b, '+', (x, y) => x + y, (x, y) => x + y);
export const pySub = (a: PyValue, b: PyValue) => arith(a, b, '-', (x, y) => x - y, (x, y) => x - y);

/** `a / b` (true division, b intero non nullo). */
export function pyTrueDiv(a: PyValue, b: number): number {
  const x = toNum(a);
  if (!x) {
    throw new PyError('TypeError', `unsupported operand type(s) for /: '${typeName(a)}' and 'int'`);
  }
  if (x.float) return x.v / b;
  // int / int in Python e' correttamente arrotondato
  return intTrueDiv(x.v, BigInt(b));
}

function intTrueDiv(a: bigint, b: bigint): number {
  const fa = Number(a);
  if (Number.isSafeInteger(fa)) return fa / Number(b);
  // Per interi grandi: approssimazione sufficiente (fuori dal range delle date comunque)
  return fa / Number(b);
}

/** `a == b` con semantica Python (1 == 1.0 == True, confronto profondo). */
export function pyEq(a: PyValue, b: PyValue): boolean {
  const x = toNum(a);
  const y = toNum(b);
  if (x || y) {
    if (!x || !y) return false;
    return numCmp(x, y) === 0;
  }
  if (a === null || b === null) return a === b;
  if (typeof a === 'string' || typeof b === 'string') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => v === b[i] || pyEq(v, b[i]));
  }
  if (isDict(a) && isDict(b)) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k)) return false;
      const w = b.get(k) as PyValue;
      if (!(v === w || pyEq(v, w))) return false;
    }
    return true;
  }
  return false;
}

/** Confronto di due stringhe per code point (come `str < str` in Python). */
export function strCmp(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const ca = ia.next();
    const cb = ib.next();
    if (ca.done && cb.done) return 0;
    if (ca.done) return -1;
    if (cb.done) return 1;
    const d = (ca.value.codePointAt(0) as number) - (cb.value.codePointAt(0) as number);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
}

/** Confronto `<` di Python per ordinamenti (numeri tra loro, stringhe tra loro). */
export function pySortCmp(a: PyValue, b: PyValue): number {
  if (typeof a === 'string' && typeof b === 'string') return strCmp(a, b);
  const x = toNum(a);
  const y = toNum(b);
  if (x && y) {
    const c = numCmp(x, y);
    return Number.isNaN(c) ? 0 : c;
  }
  throw new PyError(
    'TypeError',
    `'<' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`,
  );
}

/** Slice `s[:n]` di una stringa (per code point). */
export function strHead(s: string, n: number): string {
  return Array.from(s).slice(0, n).join('');
}

// --- Conversione a stringa ---------------------------------------------------

/** `repr(float)` di Python. */
export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const sign = x < 0 ? '-' : '';
  const [mant, expStr] = Math.abs(x).toExponential().split('e');
  const digits = mant.replace('.', '');
  const exp = parseInt(expStr, 10);
  if (exp < -4 || exp >= 16) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    const e = Math.abs(exp).toString().padStart(2, '0');
    return `${sign}${m}e${exp < 0 ? '-' : '+'}${e}`;
  }
  if (exp < 0) return `${sign}0.${'0'.repeat(-exp - 1)}${digits}`;
  const intPart = digits.slice(0, exp + 1).padEnd(exp + 1, '0');
  const frac = digits.slice(exp + 1) || '0';
  return `${sign}${intPart}.${frac}`;
}

/** `str(v)` per i valori scalari (usato nelle f-string). */
export function pyStr(v: PyValue): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number' || typeof v === 'bigint') return v.toString();
  if (typeof v === 'string') return v;
  if (v instanceof PyFloat) return floatRepr(v.value);
  throw new PyError('TypeError', `str() di ${typeName(v)} non supportato`);
}

/** Testo mostrato da Tk quando un valore Python viene passato come `text=`. */
export function tkStr(v: PyValue): string {
  if (typeof v === 'boolean') return v ? '1' : '0';
  return pyStr(v);
}

function groupThousands(intDigits: string): string {
  const neg = intDigits.startsWith('-');
  const d = neg ? intDigits.slice(1) : intDigits;
  const grouped = d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg ? `-${grouped}` : grouped;
}

/** `f"{v:,}"` */
export function fmtThousands(v: PyValue): string {
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number' || typeof v === 'bigint') return groupThousands(v.toString());
  if (v instanceof PyFloat) {
    const r = floatRepr(v.value);
    const m = /^(-?\d+)(.*)$/.exec(r);
    if (!m) return r; // nan / inf
    return groupThousands(m[1]) + m[2];
  }
  throw new PyError('ValueError', `Cannot specify ',' with ${typeName(v)}.`);
}
