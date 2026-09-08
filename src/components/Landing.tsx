import { useRef, useState, type DragEvent } from 'react';
import type { ImportDiagnostics } from '../domain/models';
import { Brand } from './Brand';
import { PrivacyBadge } from './PrivacyBadge';

interface LandingProps {
  onDemo: () => void;
  onFiles: (files: File[]) => void;
  error?: string | null;
  diagnostics?: ImportDiagnostics;
}

export function Landing({ onDemo, onFiles, error = null, diagnostics }: LandingProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFiles = (files: FileList | null) => {
    if (files && files.length > 0) {
      onFiles(Array.from(files));
      // Allow selecting the same path again after a recoverable validation error.
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFiles(event.dataTransfer.files);
  };

  return (
    <main className="landing">
      <header className="landing__nav">
        <Brand />
        <PrivacyBadge />
      </header>

      <div className="landing__stage">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__eyebrow"><span /> PROMPTPRINT</div>
          <h1 id="hero-title"><span>AIとの会話から、</span><br /><span><em>言葉の指紋</em>を見る。</span></h1>
          <p className="hero__lead">
            あなたが持ち込む言葉と、AIが返す言葉。<br />
            会話の往復に現れるパターンを、ひとつの指紋にします。
          </p>
          <div className="hero__spectrum" aria-hidden="true"><span /><span /><span /></div>
        </section>

        <section className="import-shell" aria-label="会話履歴を読み込む">
          {error && (
            <div className="error-banner" role="alert">
              <span aria-hidden="true">!</span>
              <div>
                <strong>読み込めませんでした</strong>
                <p>{error}</p>
                {diagnostics && [...diagnostics.errors, ...diagnostics.warnings]
                  .filter((item) => item.detail)
                  .slice(0, 3)
                  .map((item, index) => <small key={`${item.code}-${index}`}>{item.detail}</small>)}
              </div>
            </div>
          )}
          <div
            className={`dropzone${dragging ? ' dropzone--dragging' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={handleDrop}
          >
            <div className="dropzone__icon" aria-hidden="true">
              <svg viewBox="0 0 48 48">
                <path d="M24 31V12m0 0-7 7m7-7 7 7M10 28v7a4 4 0 0 0 4 4h20a4 4 0 0 0 4-4v-7" />
              </svg>
            </div>
            <div className="dropzone__copy">
              <h2>会話履歴をここにドロップ</h2>
              <p>ChatGPT ZIP / JSON · Claude ZIP / JSON（実験的）</p>
            </div>
            <div className="dropzone__actions">
              <button className="button button--primary" onClick={onDemo} type="button">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 7 5-7 5V5Z" /></svg>
                デモを見る
              </button>
              <button className="button button--secondary" onClick={() => inputRef.current?.click()} type="button">
                ファイルを選ぶ
              </button>
            </div>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept=".json,.zip,application/json,application/zip"
              multiple
              onChange={(event) => acceptFiles(event.target.files)}
              data-testid="file-input"
            />
          </div>
          <p className="privacy-promise">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 8V6.5a3.5 3.5 0 0 1 7 0V8m-8 0h9A1.5 1.5 0 0 1 16 9.5v6A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-6A1.5 1.5 0 0 1 5.5 8Z" /></svg>
            会話データはブラウザの外へ送信されません
          </p>
        </section>
      </div>

      <section className="how-it-works" aria-labelledby="how-title">
        <p className="section-kicker">使い方</p>
        <h2 id="how-title"><span>3ステップで、</span><span>言葉の指紋へ</span></h2>
        <ol>
          <li><span className="step-number">01</span><div className="step-icon step-icon--blue">↥</div><div><h3>読み込む</h3><p>エクスポートした会話履歴を<br />端末から選びます。</p></div></li>
          <li><span className="step-number">02</span><div className="step-icon step-icon--violet">✦</div><div><h3>端末内で分析</h3><p>役割ごとの語彙を、この<br />ブラウザだけで集計します。</p></div></li>
          <li><span className="step-number">03</span><div className="step-icon step-icon--orange">◌</div><div><h3>確かめる</h3><p>言葉を押して文脈をたどり、<br />画像として残せます。</p></div></li>
        </ol>
      </section>

      <footer className="landing__footer">
        <span>Promptprint</span>
        <span>Local-first · No upload · No tracking</span>
      </footer>
    </main>
  );
}
