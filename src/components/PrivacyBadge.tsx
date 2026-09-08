export function PrivacyBadge() {
  return (
    <div className="privacy-badge" role="note" aria-label="会話データは端末外へ送信されず、一時メモリだけで扱われます">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10m-10 0h11a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z" />
      </svg>
      <span><strong>端末外へ送信しません</strong><small>一時メモリのみ</small></span>
    </div>
  );
}
