import { safeShapeDescription } from './diagnostics';

describe('safeShapeDescription', () => {
  it('shows only recognized structural keys and never arbitrary key text', () => {
    const privateKey = `RAW_PRIVATE_SENTINEL ${'very-long-secret '.repeat(40)}`;
    const detail = safeShapeDescription({
      account: 'value-is-never-rendered',
      chats: [],
      [privateKey]: true,
    });

    expect(detail).toContain('キー: account, chats');
    expect(detail).toContain('未認識キー: 1件');
    expect(detail).not.toContain('RAW_PRIVATE_SENTINEL');
    expect(detail.length).toBeLessThan(120);
  });

  it('bounds work when an unsupported object has many keys', () => {
    const input = Object.fromEntries(
      Array.from({ length: 1_000 }, (_, index) => [`private text ${index}`, index]),
    );
    const detail = safeShapeDescription(input);

    expect(detail).toContain('64件以上');
    expect(detail).not.toContain('private text');
    expect(detail.length).toBeLessThan(80);
  });
});
