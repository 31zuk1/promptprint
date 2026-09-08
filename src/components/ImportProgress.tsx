import { ANALYSIS_STAGES, type AnalysisStage } from '../workers/protocol';
import { Brand } from './Brand';

interface ImportProgressProps {
  stage: AnalysisStage;
  onCancel: () => void;
}

export function ImportProgress({ stage, onCancel }: ImportProgressProps) {
  const active = ANALYSIS_STAGES.indexOf(stage);
  return (
    <main className="progress-page">
      <Brand />
      <section className="progress-card" aria-live="polite">
        <div className="progress-orbit" aria-hidden="true"><span /><span /><span /></div>
        <p className="section-kicker">LOCAL ANALYSIS</p>
        <h1>{stage}</h1>
        <p>会話はこの端末から出ません。少しだけお待ちください。</p>
        <ol className="progress-steps">
          {ANALYSIS_STAGES.map((item, index) => (
            <li key={item} className={index < active ? 'is-done' : index === active ? 'is-active' : ''}>
              <span>{index < active ? '✓' : index + 1}</span>{item}
            </li>
          ))}
        </ol>
        <button className="button button--ghost" type="button" onClick={onCancel}>キャンセル</button>
      </section>
    </main>
  );
}
