import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('kuromoji/package.json'));
const kuromojiRequire = createRequire(require.resolve('kuromoji/package.json'));
const winkRequire = createRequire(require.resolve('wink-pos-tagger/package.json'));
const winkTokenizerRequire = createRequire(winkRequire.resolve('wink-tokenizer/package.json'));
const prefix = 'morphology/ipadic-0.1.2/';
const files = new Map([
  ...['base', 'check', 'tid', 'tid_pos', 'tid_map', 'cc', 'unk', 'unk_pos', 'unk_map', 'unk_char', 'unk_compat', 'unk_invoke']
    .map((name) => [`${name}.dat.gz`, join(packageRoot, 'dict', `${name}.dat.gz`)]),
  ['LICENSE-2.0.txt', join(packageRoot, 'LICENSE-2.0.txt')],
  ['NOTICE.md', join(packageRoot, 'NOTICE.md')],
  ['wink-pos-tagger-LICENSE', join(dirname(require.resolve('wink-pos-tagger/package.json')), 'LICENSE')],
  ['doublearray-LICENSE', join(dirname(kuromojiRequire.resolve('doublearray/package.json')), 'LICENSE.txt')],
  ...['wink-helpers', 'wink-lemmatizer', 'wink-lexicon', 'wink-porter2-stemmer', 'wink-tokenizer']
    .map((name) => [`${name}-LICENSE`, join(dirname(winkRequire.resolve(`${name}/package.json`)), 'LICENSE')]),
  ['emoji-regex-LICENSE', join(dirname(winkTokenizerRequire.resolve('emoji-regex/package.json')), 'LICENSE-MIT.txt')],
]);

/** Static package assets, emitted for both Web and the isolated private build. */
export function morphologyAssets() {
  return {
    name: 'promptprint-bundled-ipadic',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        const name = path?.startsWith(`/${prefix}`) ? path.slice(prefix.length + 1) : '';
        const source = files.get(name);
        if (!source) return next();
        try {
          const bytes = await readFile(source);
          response.setHeader('Content-Type', name.endsWith('.gz') ? 'application/gzip' : 'text/plain; charset=utf-8');
          response.setHeader('Content-Length', bytes.length);
          response.end(bytes);
        } catch { response.statusCode = 500; response.end('Bundled dictionary unavailable'); }
      });
    },
    async generateBundle() {
      for (const [name, source] of files) {
        this.emitFile({ type: 'asset', fileName: `${prefix}${name}`, source: await readFile(source) });
      }
    },
  };
}
