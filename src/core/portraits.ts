/**
 * Caricamento dei ritratti dalla CDN (port di _fetch_pil di gui/dashboard_view.py).
 *
 * La CDN non consente l'accesso ai pixel da browser (CORS), quindi i ritratti sono
 * mostrati con <img> e gli effetti di _make_ctk sono riprodotti in composizione
 * (vedi components/UnitPortrait.tsx). Qui si replica la cache condivisa di Python,
 * compreso l'effetto collaterale della barra rossa disegnata sull'immagine in cache.
 */

export const IMG_H = 52;
export const IMG_W = Math.round((IMG_H * 175) / 230); // aspect ratio ritratti CDN: 175x230
const CDN_PORTRAIT = (id: string) => `https://cdn.ezekiel.snowprintstudios.com/ui_image_portrait_${id}_01.png`;
const FETCH_TIMEOUT_MS = 8000;
const MAX_WORKERS = 10;

/** api_id -> URL dell'immagine caricata (null se non disponibile). */
const IMG_CACHE = new Map<string, string | null>();

/**
 * api_id la cui immagine in cache ha gia' la barra rossa disegnata sopra
 * (in Python ImageDraw modifica in place l'immagine della cache).
 */
const TAINTED = new Set<string>();

export function isCached(apiId: string): boolean {
  return IMG_CACHE.has(apiId);
}

/** Inserisce direttamente un'immagine in cache (usato dai test). */
export function primeCache(apiId: string, url: string | null): void {
  IMG_CACHE.set(apiId, url);
}

export function getCached(apiId: string): string | null {
  return IMG_CACHE.get(apiId) ?? null;
}

export function isTainted(apiId: string): boolean {
  return TAINTED.has(apiId);
}

export function taint(apiId: string): void {
  TAINTED.add(apiId);
}

/** Scarica (e decodifica) l'immagine per l'api_id dato e la memorizza in cache. */
function fetchPil(apiId: string): Promise<void> {
  if (IMG_CACHE.has(apiId)) return Promise.resolve();
  const url = CDN_PORTRAIT(apiId);
  return new Promise<void>((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (result: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
      IMG_CACHE.set(apiId, result);
      resolve();
    };
    const timer = setTimeout(() => {
      img.src = '';
      finish(null);
    }, FETCH_TIMEOUT_MS);
    img.onload = () => {
      // Come Image.open: l'immagine deve essere decodificabile
      if (img.naturalWidth > 0) {
        img.decode().then(
          () => finish(url),
          () => finish(url),
        );
      } else {
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/** Equivalente di ThreadPoolExecutor(max_workers=10).map(_fetch_pil, ids). */
export async function fetchAll(apiIds: string[]): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < apiIds.length) {
      await fetchPil(apiIds[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_WORKERS, apiIds.length) }, worker));
}
