/** 32 bytes of key material as lowercase hex (64 chars). */
export type Seed = string;
export declare function seedToKeyMaterial(seed: Seed): Uint8Array;
/** Deterministically derives a fresh seed from context (used by tests/tools only). */
export declare function deriveSeed(context: string): Seed;
