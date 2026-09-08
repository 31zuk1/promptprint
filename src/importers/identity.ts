const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const UINT64_MASK = 0xffffffffffffffffn;
export const MAX_IDENTITY_HASH_EDGE_CODE_UNITS = 2_048;

const boundedIdentityMaterial = (text: string): string => {
  const fullWindow = MAX_IDENTITY_HASH_EDGE_CODE_UNITS * 2;
  if (text.length <= fullWindow) return text;
  return `${text.slice(0, MAX_IDENTITY_HASH_EDGE_CODE_UNITS)}\u0000` +
    text.slice(-MAX_IDENTITY_HASH_EDGE_CODE_UNITS);
};

/** Deterministic 64-bit hash for opaque internal identifiers. */
export const stableIdentityHash = (
  parts: readonly (string | number)[],
): string => {
  let hash = FNV64_OFFSET;
  for (const part of parts) {
    const text = String(part);
    const material = boundedIdentityMaterial(text);
    const framed = `${text.length}:${material.length}:`;
    for (let index = 0; index < framed.length; index += 1) {
      hash ^= BigInt(framed.charCodeAt(index));
      hash = (hash * FNV64_PRIME) & UINT64_MASK;
    }
    for (let index = 0; index < material.length; index += 1) {
      hash ^= BigInt(material.charCodeAt(index));
      hash = (hash * FNV64_PRIME) & UINT64_MASK;
    }
    hash ^= 0xffn;
    hash = (hash * FNV64_PRIME) & UINT64_MASK;
  }
  return hash.toString(36).padStart(13, '0');
};
