/**
 * Apple Game Center identity-verification signature checks (C12).
 *
 * Payload (UTF-8 concat): teamPlayerID + bundleId + UInt64 BE timestamp + salt
 * Algorithm: RSASSA-PKCS1-v1_5 + SHA-256 over Apple public key from publicKeyURL.
 */

export const GC_PUBLIC_KEY_HOST_ALLOWLIST = Object.freeze([
  'static.gc.apple.com',
  // Historical / regional hosts Apple has used for GC public keys.
  'san.gc.apple.com',
]);

/** Default freshness window for GC timestamps (ms). */
export const GC_TIMESTAMP_MAX_AGE_MS = 5 * 60 * 1000;

export type GameCenterProof = {
  readonly teamPlayerID: string;
  readonly bundleId: string;
  readonly publicKeyURL: string;
  readonly signature: string; // base64
  readonly salt: string; // base64
  readonly timestamp: number; // UInt64 ms from GameKit
};

export type GcVerifyResult =
  | { readonly ok: true; readonly platformId: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

export type GcVerifyDeps = {
  readonly nowMs: () => number;
  readonly fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  readonly maxAgeMs?: number;
  /** Test seam: skip RSA and only run allowlist/freshness/payload assembly. */
  readonly verifySignature?: (
    publicKeySpki: ArrayBuffer,
    data: Uint8Array,
    signature: Uint8Array,
  ) => Promise<boolean>;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function assertGcPublicKeyUrl(raw: string): URL | { code: string; message: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { code: 'gc_bad_public_key_url', message: 'publicKeyURL is not a valid URL' };
  }
  if (url.protocol !== 'https:') {
    return { code: 'gc_bad_public_key_url', message: 'publicKeyURL must be https' };
  }
  if (!GC_PUBLIC_KEY_HOST_ALLOWLIST.includes(url.hostname)) {
    return {
      code: 'gc_public_key_host_denied',
      message: `publicKeyURL host not allowlisted: ${url.hostname}`,
    };
  }
  return url;
}

/** Build the signed byte buffer GameKit documents. */
export function buildGameCenterSignedPayload(
  teamPlayerID: string,
  bundleId: string,
  timestamp: number,
  salt: Uint8Array,
): Uint8Array {
  const enc = new TextEncoder();
  const idBytes = enc.encode(teamPlayerID);
  const bundleBytes = enc.encode(bundleId);
  const ts = new ArrayBuffer(8);
  new DataView(ts).setBigUint64(0, BigInt(timestamp), false); // big-endian
  const tsBytes = new Uint8Array(ts);
  const out = new Uint8Array(idBytes.length + bundleBytes.length + tsBytes.length + salt.length);
  let o = 0;
  out.set(idBytes, o);
  o += idBytes.length;
  out.set(bundleBytes, o);
  o += bundleBytes.length;
  out.set(tsBytes, o);
  o += tsBytes.length;
  out.set(salt, o);
  return out;
}

type DerNode = {
  readonly tag: number;
  readonly headerLength: number;
  readonly length: number;
  readonly start: number; // content start
  readonly end: number; // content end (exclusive)
  readonly tlvStart: number;
  readonly tlvEnd: number;
};

function readDerLength(
  der: Uint8Array,
  offset: number,
): { length: number; headerBytes: number } | null {
  if (offset >= der.length) return null;
  const first = der[offset];
  if (first < 0x80) return { length: first, headerBytes: 1 };
  const n = first & 0x7f;
  if (n === 0 || n > 4 || offset + 1 + n > der.length) return null;
  let length = 0;
  for (let i = 0; i < n; i++) length = (length << 8) | der[offset + 1 + i];
  return { length, headerBytes: 1 + n };
}

function readDerNode(der: Uint8Array, tlvStart: number): DerNode | null {
  if (tlvStart >= der.length) return null;
  const tag = der[tlvStart];
  const lenInfo = readDerLength(der, tlvStart + 1);
  if (!lenInfo) return null;
  const headerLength = 1 + lenInfo.headerBytes;
  const start = tlvStart + headerLength;
  const end = start + lenInfo.length;
  if (end > der.length) return null;
  return {
    tag,
    headerLength,
    length: lenInfo.length,
    start,
    end,
    tlvStart,
    tlvEnd: end,
  };
}

function readSequenceChildren(der: Uint8Array, seq: DerNode): DerNode[] | null {
  if (seq.tag !== 0x30) return null;
  const kids: DerNode[] = [];
  let i = seq.start;
  while (i < seq.end) {
    const kid = readDerNode(der, i);
    if (!kid || kid.tlvEnd > seq.end) return null;
    kids.push(kid);
    i = kid.tlvEnd;
  }
  return kids;
}

/**
 * Extract SubjectPublicKeyInfo from a DER/PEM X.509 certificate.
 *
 * Walks Certificate → tbsCertificate → subjectPublicKeyInfo (7th element of
 * TBS, after optional [0] version). Does **not** stop at AlgorithmIdentifier.
 */
export function extractSpkiFromCertificate(certDer: Uint8Array): ArrayBuffer | null {
  let der = certDer;
  const asText = new TextDecoder().decode(certDer);
  if (asText.includes('BEGIN CERTIFICATE')) {
    const b64 = asText
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
    try {
      der = b64ToBytes(b64);
    } catch {
      return null;
    }
  }

  const cert = readDerNode(der, 0);
  if (!cert || cert.tag !== 0x30) return null;
  const certKids = readSequenceChildren(der, cert);
  if (!certKids || certKids.length < 1) return null;

  const tbs = certKids[0];
  if (tbs.tag !== 0x30) return null;
  const tbsKids = readSequenceChildren(der, tbs);
  if (!tbsKids || tbsKids.length < 6) return null;

  // TBSCertificate: [version], serial, signature, issuer, validity, subject, spki, …
  let idx = 0;
  if ((tbsKids[0].tag & 0xe0) === 0xa0) {
    // Explicit [0] version — skip
    idx = 1;
  }
  // serial(1) + signature(1) + issuer(1) + validity(1) + subject(1) + spki(1)
  if (tbsKids.length < idx + 6) return null;
  const spki = tbsKids[idx + 5];
  if (spki.tag !== 0x30) return null;

  // SPKI must contain AlgorithmIdentifier SEQUENCE + subjectPublicKey BIT STRING
  const spkiKids = readSequenceChildren(der, spki);
  if (!spkiKids || spkiKids.length < 2) return null;
  if (spkiKids[0].tag !== 0x30 || spkiKids[1].tag !== 0x03) return null;

  return der.slice(spki.tlvStart, spki.tlvEnd).buffer;
}

async function defaultVerifySignature(
  publicKeySpki: ArrayBuffer,
  data: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'spki',
    publicKeySpki,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const sig = signature.buffer.slice(
    signature.byteOffset,
    signature.byteOffset + signature.byteLength,
  ) as ArrayBuffer;
  const msg = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, msg);
}

export async function verifyGameCenterProof(
  proof: GameCenterProof,
  deps: GcVerifyDeps,
): Promise<GcVerifyResult> {
  if (!proof.teamPlayerID || !proof.bundleId) {
    return { ok: false, code: 'gc_missing_fields', message: 'teamPlayerID and bundleId required' };
  }

  const urlOrErr = assertGcPublicKeyUrl(proof.publicKeyURL);
  if (!(urlOrErr instanceof URL)) return { ok: false, ...urlOrErr };

  const now = deps.nowMs();
  const maxAge = deps.maxAgeMs ?? GC_TIMESTAMP_MAX_AGE_MS;
  if (!Number.isFinite(proof.timestamp) || proof.timestamp <= 0) {
    return { ok: false, code: 'gc_bad_timestamp', message: 'timestamp invalid' };
  }
  if (Math.abs(now - proof.timestamp) > maxAge) {
    return { ok: false, code: 'gc_timestamp_stale', message: 'timestamp outside freshness window' };
  }

  let certRes: Response;
  try {
    certRes = await deps.fetch(urlOrErr.toString(), {
      method: 'GET',
      redirect: 'error', // no redirects
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return {
      ok: false,
      code: 'gc_public_key_fetch_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (!certRes.ok) {
    return {
      ok: false,
      code: 'gc_public_key_fetch_failed',
      message: `HTTP ${certRes.status}`,
    };
  }

  const certBytes = new Uint8Array(await certRes.arrayBuffer());
  const spki = extractSpkiFromCertificate(certBytes);
  if (!spki) {
    return {
      ok: false,
      code: 'gc_bad_certificate',
      message: 'could not extract SPKI from certificate',
    };
  }

  let salt: Uint8Array;
  let signature: Uint8Array;
  try {
    salt = b64ToBytes(proof.salt);
    signature = b64ToBytes(proof.signature);
  } catch {
    return { ok: false, code: 'gc_bad_encoding', message: 'salt/signature must be base64' };
  }

  const payload = buildGameCenterSignedPayload(
    proof.teamPlayerID,
    proof.bundleId,
    proof.timestamp,
    salt,
  );

  try {
    const verify = deps.verifySignature ?? defaultVerifySignature;
    const ok = await verify(spki, payload, signature);
    if (!ok) {
      return {
        ok: false,
        code: 'gc_signature_invalid',
        message: 'RSA signature verification failed',
      };
    }
  } catch {
    // importKey / verify throws on bad SPKI or malformed signature → fail closed
    return {
      ok: false,
      code: 'gc_signature_invalid',
      message: 'RSA signature verification failed',
    };
  }

  return { ok: true, platformId: proof.teamPlayerID };
}
