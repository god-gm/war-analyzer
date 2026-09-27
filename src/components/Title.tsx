/** Titolo "Ordo Malleus - War Stats Analyzer" con resa grafica. */
export function Title({ as: Tag = 'h1', className = '' }: { as?: 'h1' | 'h2'; className?: string }) {
  return (
    <Tag className={`title ${className}`}>
      <span className="title-guild">Ordo Malleus</span>
      <span className="title-sep" aria-hidden="false">
        {' - '}
      </span>
      <span className="title-app">War Stats Analyzer</span>
    </Tag>
  );
}
