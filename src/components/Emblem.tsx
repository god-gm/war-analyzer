import logo from '../assets/ordo_malleus_logo.png';

/** Logo dell'Ordo Malleus (proporzioni originali 250x388). */
export function Emblem({ height = 64, className = '' }: { height?: number; className?: string }) {
  return (
    <img
      className={`emblem ${className}`}
      src={logo}
      height={height}
      width={Math.round((height * 250) / 388)}
      alt="Logo Ordo Malleus"
      draggable={false}
    />
  );
}
