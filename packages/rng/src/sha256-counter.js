/**
 * Deterministic PRNG: SHA-256 counter mode.
 *
 * State is (key material, counter). Each draw hashes a domain-separated block
 * and consumes 8 bytes as an unsigned 64-bit integer. This is platform-neutral
 * (pure integer arithmetic + a hash function), so JS and native targets agree.
 *
 * v1 is frozen: changing the algorithm requires a new name/version because
 * stored replays reference it.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { SHA256_ALGORITHM } from './index.js';
const BLOCK_BYTES = 32;
const DRAW_BYTES = 8;
function drawBlock(state) {
  const input = new Uint8Array(BLOCK_BYTES + 8);
  input.set(state.key, 0);
  // Big-endian 64-bit counter encoding; Number.isSafeInteger bounds apply.
  const c = state.counter;
  const lo = BigInt(c & 0xffffffff);
  const hi = BigInt(Math.floor(c / 0x100000000));
  for (let i = 0; i < 4; i++) {
    input[BLOCK_BYTES + i] = Number((hi >> BigInt(8 * (3 - i))) & 0xffn);
    input[BLOCK_BYTES + 4 + i] = Number((lo >> BigInt(8 * (3 - i))) & 0xffn);
  }
  state.counter += 1;
  const digest = sha256(input);
  let buf = 0n;
  for (let byteIdx = 0; byteIdx < DRAW_BYTES; byteIdx++) {
    const byte = digest[byteIdx] ?? 0;
    buf = (buf << 8n) | BigInt(byte);
  }
  state.buffer.push(buf);
}
/** Creates an RNG from up-to-32-byte key material. Shorter keys are zero-padded. */
export function createSha256Rng(key) {
  if (key.length === 0 || key.length > 32) {
    throw new Error(`sha256-counter-v1 key must be 1..32 bytes, got ${key.length}`);
  }
  const padded = new Uint8Array(32);
  padded.set(key, 0);
  const state = {
    algorithm: SHA256_ALGORITHM,
    key: padded,
    counter: 0,
    buffer: [],
  };
  const nextRaw = () => {
    if (state.buffer.length === 0) {
      drawBlock(state);
    }
    return state.buffer.shift();
  };
  return {
    algorithm: SHA256_ALGORITHM,
    nextInt(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0xffffffff) {
        throw new Error(`nextInt: maxExclusive must be integer in [1, 2^32), got ${maxExclusive}`);
      }
      // Rejection sampling on 32 bits keeps the distribution exact.
      const limit = 0x100000000 - (0x100000000 % maxExclusive);
      for (;;) {
        const raw = nextRaw();
        const value = Number(raw >> 32n); // high 32 bits
        if (value < limit) {
          return value % maxExclusive;
        }
      }
    },
    nextIntInRange(minInclusive, maxInclusive) {
      if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
        throw new Error('nextIntInRange: bounds must be integers');
      }
      if (maxInclusive < minInclusive) {
        throw new Error('nextIntInRange: empty range');
      }
      const span = maxInclusive - minInclusive + 1;
      return minInclusive + this.nextInt(span);
    },
    snapshotKeyHex() {
      let hex = '';
      for (const b of state.key) hex += b.toString(16).padStart(2, '0');
      return hex;
    },
  };
}
//# sourceMappingURL=sha256-counter.js.map
