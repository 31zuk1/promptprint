import '@testing-library/jest-dom/vitest';
import { beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeMorphology } from '../analysis/morphology';

beforeAll(async () => {
  await initializeMorphology(async (name) => new Uint8Array(await readFile(resolve('node_modules/kuromoji/dict', name))));
}, 30_000);
