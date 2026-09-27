/**
 * Ritratto di un'unita': riproduce in composizione la pipeline PIL di _make_ctk.
 *
 *   img = immagine in cache (eventualmente con la barra gia' disegnata: "tainted")
 *   if not alive:         img = Brightness(convert L -> RGBA).enhance(0.35)   -> filtro SVG #pil-dead
 *   if not had_hp_before: rectangle (0,0)-(W-1,3) fill (210,40,40,230)         -> barra che sostituisce i pixel
 *   if is_mow:            fondo oro 40x52 + img ridimensionata a 36x48 in (2,2)
 */

import type { UnitView } from '../core/dashboard';
import { IMG_H, IMG_W } from '../core/portraits';

type ImageUnit = Extract<UnitView, { kind: 'image' }>;

function Composition({ unit }: { unit: ImageUnit }) {
  return (
    <span className="portrait-canvas">
      {/* Immagine in cache (con eventuale barra gia' disegnata), poi eventuale grigio */}
      <span className={`portrait-layer${unit.alive ? '' : ' is-dead'}${unit.hadHpBefore ? '' : ' is-cut'}`}>
        <img
          className={`portrait-img${unit.tainted ? ' is-cut' : ''}`}
          src={unit.src}
          width={IMG_W}
          height={IMG_H}
          alt={unit.unitId}
          draggable={false}
        />
        {unit.tainted && <span className="portrait-bar" />}
      </span>
      {/* Barra rossa: era gia' morto prima della battaglia */}
      {!unit.hadHpBefore && <span className="portrait-bar" />}
    </span>
  );
}

export function UnitPortrait({ unit }: { unit: ImageUnit }) {
  if (unit.isMow) {
    return (
      <span className="portrait is-mow" title={unit.unitId}>
        <span className="portrait-mow-inner">
          <Composition unit={unit} />
        </span>
      </span>
    );
  }
  return (
    <span className="portrait" title={unit.unitId}>
      <Composition unit={unit} />
    </span>
  );
}

/** Filtri SVG condivisi (da montare una sola volta). */
export function PortraitFilters() {
  // L = 0.299 R + 0.587 G + 0.114 B (ITU-R 601-2, come PIL "L"), poi * 0.35; alpha opaca
  const r = (0.299 * 0.35).toFixed(5);
  const g = (0.587 * 0.35).toFixed(5);
  const b = (0.114 * 0.35).toFixed(5);
  const row = `${r} ${g} ${b} 0 0`;
  return (
    <svg className="svg-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="pil-dead" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
        <feColorMatrix type="matrix" values={`${row} ${row} ${row} 0 0 0 0 1`} />
      </filter>
    </svg>
  );
}
