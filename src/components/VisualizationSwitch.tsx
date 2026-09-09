export type VisualizationMode = 'mirror' | 'spatial';

export function VisualizationSwitch({ mode, onChange, disabled }: {
  mode: VisualizationMode; onChange: (mode: VisualizationMode) => void; disabled?: boolean;
}) {
  return <div className="visualization-switch" role="group" aria-label="可視化の形式">
    <button type="button" aria-pressed={mode === 'mirror'} onClick={() => onChange('mirror')} disabled={disabled}>2D ミラー</button>
    <button type="button" aria-pressed={mode === 'spatial'} onClick={() => onChange('spatial')} disabled={disabled}>3D 分布</button>
  </div>;
}
