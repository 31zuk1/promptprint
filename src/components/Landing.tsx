import { useRef, useState, type DragEvent } from 'react';
import type { ImportDiagnostics } from '../domain/models';
import { Brand } from './Brand';

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
      </header>

      <div className="landing__stage">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title" aria-label="AIとの会話から、言葉の指紋を見る。">
            <span>AIとの会話から<span className="hero__punctuation">、</span></span><br />
            <span>言葉の指紋を見る<span className="hero__punctuation">。</span></span>
          </h1>
          <p className="hero__lead">
            <span>あなたが持ち込む言葉と、AIが返す言葉<span className="hero__punctuation">。</span></span><br />
            <span>会話に現れる語彙を、ひとつの図に<span className="hero__punctuation">。</span></span>
          </p>
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
            <div className="dropzone__actions">
              <button className="button button--primary" onClick={onDemo} type="button">
                デモを見る
              </button>
              <button className="button button--secondary" onClick={() => inputRef.current?.click()} type="button">
                ファイルを選ぶ
              </button>
            </div>
            <p className="dropzone__hint">ここにファイルをドロップすることもできます</p>
            <p className="dropzone__formats">
              <span>ChatGPT ZIP / JSON</span>
              <span>Claude ZIP / JSON（実験的）</span>
            </p>
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
            会話データはブラウザの外へ送信されません
          </p>
        </section>
      </div>

      <section className="how-it-works" aria-labelledby="how-title">
        <p className="section-kicker">使い方</p>
        <h2 id="how-title"><span>3ステップで、</span><span>言葉の指紋へ</span></h2>
        <ol>
          <li><span className="step-number" aria-hidden="true">01</span><div><h3>読み込む</h3><p>エクスポートした会話履歴を<br />端末から選びます。</p></div></li>
          <li><span className="step-number" aria-hidden="true">02</span><div><h3>端末内で分析</h3><p>役割ごとの語彙を、この<br />ブラウザだけで集計します。</p></div></li>
          <li><span className="step-number" aria-hidden="true">03</span><div><h3>確かめる</h3><p>言葉を押して文脈をたどり、<br />画像として残せます。</p></div></li>
        </ol>
      </section>

      <footer className="landing__footer">
        <span>Promptprint</span>
        <span>Local-first · No upload · No tracking</span>
      </footer>
    </main>
  );
}
