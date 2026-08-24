/**
 * Seed derivation helpers.
 *
 * A seed is an opaque hex string; combat inputs hash into per-battle key
 * material via SHA-256 so any seed length works and domain separation is
 * explicit ("botore/combat/v1/<battleId>/<rulesVersion>").
 *
 * PURE: uses @noble/hashes (pure JS), no Node crypto.
 */
import { sha256 } from '@noble/hashes/sha2.js';
export function seedToKeyMaterial(seed) {
    if (!/^[0-9a-f]{16,128}$/.test(seed)) {
        throw new Error(`seed must be 16..128 lowercase hex chars, got: ${seed.slice(0, 8)}…`);
    }
    const bytes = new Uint8Array(seed.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(seed.slice(i * 2, i * 2 + 2), 16);
    }
    return sha256(bytes);
}
/** Deterministically derives a fresh seed from context (used by tests/tools only). */
export function deriveSeed(context) {
    const digest = sha256(new TextEncoder().encode(context));
    let hex = '';
    for (const b of digest)
        hex += b.toString(16).padStart(2, '0');
    return hex;
}
//# sourceMappingURL=seed.js.map