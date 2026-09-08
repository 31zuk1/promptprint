interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={`brand${compact ? ' brand--compact' : ''}`} aria-label="Promptprint">
      <span className="brand__word">Promptprint</span>
    </div>
  );
}
