import type { DiagnosticItem, ImportDiagnostics } from '../domain/models';

interface DiagnosticsPanelProps {
  diagnostics: ImportDiagnostics;
  analysisDiagnostics?: DiagnosticItem[];
}

export function DiagnosticsPanel({ diagnostics, analysisDiagnostics = [] }: DiagnosticsPanelProps) {
  const items = [...diagnostics.errors, ...diagnostics.warnings, ...analysisDiagnostics];
  if (items.length === 0) return null;
  return (
    <details className="diagnostics-panel">
      <summary>読み込み診断 {items.length}件</summary>
      <div>
        <p>解析: {diagnostics.conversationsParsed}会話・{diagnostics.messagesParsed}発言 ／ スキップ: {diagnostics.recordsSkipped}件</p>
        <ul>
          {items.map((item, index) => (
            <li key={`${item.code}-${index}`} className={`diagnostic-${item.level}`}>
              <strong>{item.message}</strong>
              {item.sourceFile && <span>{item.sourceFile}</span>}
              {item.detail && <small>{item.detail}</small>}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
