import type { AnalysisSettings, Provider } from '../domain/models';

interface FilterBarProps {
  settings: AnalysisSettings;
  providers: Provider[];
  busy: boolean;
  onChange: (settings: AnalysisSettings) => void;
}

export function FilterBar({ settings, providers, busy, onChange }: FilterBarProps) {
  const set = <K extends keyof AnalysisSettings>(key: K, value: AnalysisSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <section className="filter-bar" aria-label="分析フィルター">
      <label>
        <span>対象</span>
        <select
          value={settings.provider}
          disabled={busy}
          onChange={(event) => set('provider', event.target.value as AnalysisSettings['provider'])}
        >
          <option value="all">すべて</option>
          {providers.includes('chatgpt') && <option value="chatgpt">ChatGPT</option>}
          {providers.includes('claude') && <option value="claude">Claude（実験的）</option>}
          {providers.includes('demo') && <option value="demo">合成デモ</option>}
        </select>
      </label>
      <label>
        <span>期間</span>
        <select value={settings.timeRange} disabled={busy} onChange={(event) => set('timeRange', event.target.value as AnalysisSettings['timeRange'])}>
          <option value="all">すべての期間</option>
          <option value="30d">直近30日</option>
          <option value="90d">直近90日</option>
          <option value="1y">直近1年</option>
        </select>
      </label>
      <label>
        <span>表示する語</span>
        <select value={settings.termLimit} disabled={busy} onChange={(event) => set('termLimit', Number(event.target.value) as AnalysisSettings['termLimit'])}>
          {[40, 60, 80, 120].map((value) => <option value={value} key={value}>{value}語</option>)}
        </select>
      </label>
      <fieldset>
        <legend>語の種類</legend>
        <div className="segmented-control">
          <button type="button" disabled={busy} aria-pressed={settings.includePhrases} className={settings.includePhrases ? 'is-active' : ''} onClick={() => set('includePhrases', true)}>単語＋フレーズ</button>
          <button type="button" disabled={busy} aria-pressed={!settings.includePhrases} className={!settings.includePhrases ? 'is-active' : ''} onClick={() => set('includePhrases', false)}>単語のみ</button>
        </div>
      </fieldset>
      <div className="filter-toggles">
        <label className="check-control">
          <input type="checkbox" checked={settings.excludeCode} disabled={busy} onChange={(event) => set('excludeCode', event.target.checked)} />
          <span /> コードを除外
        </label>
        <label className="check-control">
          <input type="checkbox" checked={settings.excludeQuotes} disabled={busy} onChange={(event) => set('excludeQuotes', event.target.checked)} />
          <span /> 引用を除外
        </label>
      </div>
      {busy && <span className="filter-busy" role="status"><i />更新中</span>}
    </section>
  );
}
