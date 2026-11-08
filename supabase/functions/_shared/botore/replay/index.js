/**
 * Versioned replay envelope + validation + checksums.
 *
 * PURE PACKAGE. A replay stores the full semantic event stream AND the
 * seed/rules/input versions — a seed alone is never sufficient (see
 * docs/adr/0005-deterministic-replay-storage.md).
 */
import { sha256 } from '../noble-hashes/sha2.js';
/** Current envelope version. Bump on breaking shape changes. */
export const REPLAY_VERSION = 1;
// ---------------------------------------------------------------------------
// Validation (runtime — replays cross process/network boundaries)
// ---------------------------------------------------------------------------
export class ReplayValidationError extends Error {
    issues;
    constructor(message, issues) {
        super(message);
        this.issues = issues;
        this.name = 'ReplayValidationError';
    }
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function fail(issues) {
    throw new ReplayValidationError('replay failed validation', issues);
}
function validateFighter(v, issues, idx) {
    if (!isRecord(v)) {
        issues.push(`fighters[${idx}] not an object`);
        return;
    }
    for (const key of [
        'characterId',
        'displayName',
        'hp',
        'strength',
        'agility',
        'speed',
        'weaponKind',
        'weaponPower',
    ]) {
        if (!(key in v))
            issues.push(`fighters[${idx}].${key} missing`);
    }
    if (typeof v['characterId'] !== 'string')
        issues.push(`fighters[${idx}].characterId not string`);
    if (typeof v['displayName'] !== 'string')
        issues.push(`fighters[${idx}].displayName not string`);
    for (const key of ['hp', 'strength', 'agility', 'speed', 'weaponPower']) {
        if (key in v && !Number.isInteger(v[key]))
            issues.push(`fighters[${idx}].${key} not integer`);
    }
    if ('weaponKind' in v &&
        v['weaponKind'] !== 'sword' &&
        v['weaponKind'] !== 'axe' &&
        v['weaponKind'] !== 'dagger') {
        issues.push(`fighters[${idx}].weaponKind invalid`);
    }
}
const EVENT_TYPES = new Set([
    'battle_started',
    'turn_started',
    'attack_selected',
    'dodged',
    'damage_applied',
    'character_defeated',
    'battle_ended',
]);
/**
 * Structural validation of an unknown payload into `BattleReplay`.
 * Checks envelope fields, event ordering/monotonicity, and outcome coherence.
 */
export function validateReplay(raw) {
    const issues = [];
    if (!isRecord(raw))
        fail(['replay is not an object']);
    const r = raw;
    if (r['replayVersion'] !== REPLAY_VERSION) {
        issues.push(`replayVersion must be ${REPLAY_VERSION}`);
    }
    if (typeof r['rulesVersion'] !== 'string' || r['rulesVersion'].length === 0) {
        issues.push('rulesVersion missing');
    }
    if (typeof r['battleId'] !== 'string' || r['battleId'].length === 0) {
        issues.push('battleId missing');
    }
    if (typeof r['seed'] !== 'string' || !/^[0-9a-f]{16,128}$/.test(r['seed'])) {
        issues.push('seed malformed');
    }
    if (typeof r['inputHash'] !== 'string' || !/^[0-9a-f]{64}$/.test(r['inputHash'])) {
        issues.push('inputHash malformed');
    }
    if (!Array.isArray(r['fighters']) || r['fighters'].length !== 2) {
        issues.push('fighters must be exactly two entries');
    }
    else {
        r['fighters'].forEach((f, i) => validateFighter(f, issues, i));
    }
    const events = r['events'];
    if (!Array.isArray(events) || events.length === 0) {
        issues.push('events must be a non-empty array');
    }
    else {
        let prevSeq = -1;
        for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (!isRecord(ev) || typeof ev['type'] !== 'string' || !EVENT_TYPES.has(ev['type'])) {
                issues.push(`events[${i}] unknown type`);
                continue;
            }
            const seq = ev['seq'];
            if (!Number.isInteger(seq) || seq <= prevSeq) {
                issues.push(`events[${i}].seq not monotonic`);
            }
            else {
                prevSeq = seq;
            }
            if (ev['type'] === 'damage_applied' && !Number.isInteger(ev['amount'])) {
                issues.push(`events[${i}].damage_applied.amount not integer`);
            }
        }
        const first = events[0];
        const last = events[events.length - 1];
        if (first?.['type'] !== 'battle_started') {
            issues.push('first event must be battle_started');
        }
        if (last?.['type'] !== 'battle_ended') {
            issues.push('last event must be battle_ended');
        }
    }
    if (issues.length > 0)
        fail(issues);
    return raw;
}
// ---------------------------------------------------------------------------
// Canonical serialization + checksums
// ---------------------------------------------------------------------------
/** Deterministic JSON: keys sorted lexicographically at every level. */
export function canonicalJson(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
    }
    const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
function toHex(digest) {
    let hex = '';
    for (const b of digest)
        hex += b.toString(16).padStart(2, '0');
    return hex;
}
export function computeInputHash(fighters) {
    return toHex(sha256(new TextEncoder().encode(canonicalJson(fighters))));
}
/** Computes the replay checksum over the envelope without the checksum field. */
export function computeChecksum(replay) {
    return toHex(sha256(new TextEncoder().encode(canonicalJson(replay))));
}
/** Finalizes an unsigned envelope by appending its checksum. */
export function sealReplay(envelope) {
    return Object.freeze({ ...envelope, checksum: computeChecksum(envelope) });
}
/** Verifies checksum integrity; throws on mismatch. */
export function verifyReplay(replay) {
    const { checksum: _ignored, ...rest } = replay;
    const expected = computeChecksum(rest);
    if (expected !== replay.checksum) {
        throw new ReplayValidationError('replay checksum mismatch', [
            `expected ${expected}`,
            `got ${replay.checksum}`,
        ]);
    }
}
//# sourceMappingURL=index.js.map