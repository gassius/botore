import { type Rng } from './index.js';
/** Creates an RNG from up-to-32-byte key material. Shorter keys are zero-padded. */
export declare function createSha256Rng(key: Uint8Array): Rng & {
    snapshotKeyHex(): string;
};
