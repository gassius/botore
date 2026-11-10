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

/** Extract SPKI from a DER/PEM X.509 certificate (minimal ASN.1 walk for SubjectPublicKeyInfo). */
export function extractSpkiFromCertificate(certDer: Uint8Array): ArrayBuffer | null {
  // Prefer PEM unwrap.
  let der = certDer;
  const asText = new TextDecoder().decode(certDer);
  if (asText.includes('BEGIN CERTIFICATE')) {
    const b64 = asText
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
    der = b64ToBytes(b64);
  }

  // Scan for BIT STRING that typically wraps SPKI inside the certificate.
  // For robust production we validate Apple chain; here we locate AlgorithmIdentifier+BIT STRING SPKI.
  // Look for rsaEncryption OID 1.2.840.113549.1.1.1 → 06 09 2A 86 48 86 F7 0D 01 01 01
  const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  let oidAt = -1;
  for (let i = 0; i < der.length - oid.length; i++) {
    let match = true;
    for (let j = 0; j < oid.length; j++) {
      if (der[i + j] !== oid[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      oidAt = i;
      break;
    }
  }
  if (oidAt < 0) return null;

  // Walk back to SEQUENCE start of SubjectPublicKeyInfo (tag 0x30).
  let spkiStart = -1;
  for (let i = oidAt; i >= 0; i--) {
    if (der[i] === 0x30) {
      spkiStart = i;
      // Heuristic: SPKI is a short SEQUENCE containing AlgorithmIdentifier + BIT STRING
      break;
    }
  }
  if (spkiStart < 0) return null;

  // Parse length of SEQUENCE at spkiStart
  let idx = spkiStart + 1;
  if (idx >= der.length) return null;
  let len = der[idx++];
  if (len > 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | der[idx++];
  }
  const spkiEnd = idx + len;
  if (spkiEnd > der.length) return null;
  return der.slice(spkiStart, spkiEnd).buffer;
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
  const verify = deps.verifySignature ?? defaultVerifySignature;
  const ok = await verify(spki, payload, signature);
  if (!ok) {
    return {
      ok: false,
      code: 'gc_signature_invalid',
      message: 'RSA signature verification failed',
    };
  }

  return { ok: true, platformId: proof.teamPlayerID };
}
