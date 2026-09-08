import {
  MAX_IDENTITY_HASH_EDGE_CODE_UNITS,
  stableIdentityHash,
} from './identity';

describe('stableIdentityHash', () => {
  it('is deterministic and bounds hashing of untrusted identity strings', () => {
    const edge = 'x'.repeat(MAX_IDENTITY_HASH_EDGE_CODE_UNITS);
    const first = `${edge}middle-alpha${edge}`;
    const second = `${edge}middle-beta-${edge}`;

    expect(stableIdentityHash(['source', first, 0]))
      .toBe(stableIdentityHash(['source', first, 0]));
    expect(stableIdentityHash(['source', first, 0]))
      .not.toBe(stableIdentityHash(['source', second, 1]));
  });
});
