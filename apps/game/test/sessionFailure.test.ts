import { describe, expect, it } from 'vitest';
import {
  classifySessionFailure,
  resolveForcedSessionFailure,
  resolveTransportFailureCode,
  SESSION_FAILURE_COPY,
} from '../src/session-failure';
import {
  beginSave,
  createLoadoutPreviewState,
  failSave,
  setPendingLoadout,
} from '../src/garage/loadout/loadoutState';
import { DEFAULT_CONFIRMED_LOADOUT, withUpdatedPaint } from '../src/garage/loadout/proofCatalogue';
import { applyRankingLoadResult, createInitialRankingSession } from '../src/ranking/rankingSession';
import { parseDesignCaptureSessionFailure, parseDesignCaptureUrl } from '../src/design-capture';

describe('C10 session failure classification', () => {
  it('classifies network / offline codes', () => {
    expect(classifySessionFailure({ code: 'network_error' })).toBe('offline');
    expect(classifySessionFailure({ message: 'Network request failed' })).toBe('offline');
    expect(classifySessionFailure({ message: 'Failed to fetch' })).toBe('offline');
  });

  it('classifies auth-expired / JWT / 401', () => {
    expect(classifySessionFailure({ code: 'unauthenticated' })).toBe('auth_expired');
    expect(classifySessionFailure({ code: 'http_401' })).toBe('auth_expired');
    expect(classifySessionFailure({ httpStatus: 401 })).toBe('auth_expired');
    expect(classifySessionFailure({ code: 'PGRST301', message: 'JWT expired' })).toBe(
      'auth_expired',
    );
  });

  it('resolves transport codes for adapters', () => {
    expect(resolveTransportFailureCode({ httpStatus: 401, message: 'JWT expired' })).toBe(
      'unauthenticated',
    );
    expect(resolveTransportFailureCode({ code: 'network_error' })).toBe('network_error');
    expect(resolveTransportFailureCode({ code: 'allowance_exhausted' })).toBe(
      'allowance_exhausted',
    );
  });

  it('keeps shared player-facing copy stable', () => {
    expect(SESSION_FAILURE_COPY.offline.title).toMatch(/offline/i);
    expect(SESSION_FAILURE_COPY.auth_expired.actionLabel).toMatch(/sign in again/i);
  });
});

describe('C10 F8 save failure preserves confirmed', () => {
  it('failSave keeps confirmed loadout and records error code', () => {
    let state = createLoadoutPreviewState({
      accountId: 'a',
      characterId: 'c',
      displayName: 'Pilot',
      confirmedLoadout: DEFAULT_CONFIRMED_LOADOUT,
      confirmedVersionId: 'v-before',
    });
    state = setPendingLoadout(state, withUpdatedPaint(state.pendingLoadout!, 'paint-cobalt'));
    state = beginSave(state);
    state = failSave(state, 'Could not save changes.', 'network_error');
    expect(state.confirmedLoadout!.paint).toBe(DEFAULT_CONFIRMED_LOADOUT.paint);
    expect(state.confirmedVersionId).toBe('v-before');
    expect(state.pendingLoadout!.paint).toBe('paint-cobalt');
    expect(state.dirty).toBe(true);
    expect(state.lastErrorCode).toBe('network_error');
    expect(classifySessionFailure({ code: state.lastErrorCode, message: state.lastError })).toBe(
      'offline',
    );
  });
});

describe('C10 ranking never looks empty on transport failure', () => {
  it('maps offline/auth errors to error phase with code, not empty', () => {
    const offline = applyRankingLoadResult(createInitialRankingSession(), {
      kind: 'error',
      message: 'offline',
      code: 'network_error',
    });
    expect(offline.phase).toBe('error');
    expect(offline.rows).toHaveLength(0);
    expect(offline.errorCode).toBe('network_error');
    expect(classifySessionFailure({ code: offline.errorCode })).toBe('offline');

    const auth = applyRankingLoadResult(createInitialRankingSession(), {
      kind: 'error',
      message: 'expired',
      code: 'unauthenticated',
    });
    expect(auth.phase).toBe('error');
    expect(auth.errorCode).toBe('unauthenticated');
    expect(classifySessionFailure({ code: auth.errorCode })).toBe('auth_expired');
  });
});

describe('C10 design-capture sessionFailure', () => {
  it('parses deep-link sessionFailure', () => {
    expect(parseDesignCaptureSessionFailure('offline')).toBe('offline');
    expect(parseDesignCaptureSessionFailure('auth_expired')).toBe('auth_expired');
    expect(
      parseDesignCaptureUrl('botore://capture/Opponents?sessionFailure=offline'),
    ).toMatchObject({
      route: 'Opponents',
      sessionFailure: 'offline',
    });
    expect(
      parseDesignCaptureUrl('botore://capture/Ranking?sessionFailure=auth_expired'),
    ).toMatchObject({
      route: 'Ranking',
      sessionFailure: 'auth_expired',
    });
  });

  it('resolves forced failure only under design-capture', () => {
    expect(
      resolveForcedSessionFailure({
        enabled: false,
        intentFailure: 'offline',
      }),
    ).toBeNull();
    expect(
      resolveForcedSessionFailure({
        enabled: true,
        intentFailure: 'auth_expired',
      }),
    ).toBe('auth_expired');
    expect(
      resolveForcedSessionFailure({
        enabled: true,
        envRaw: 'offline',
      }),
    ).toBe('offline');
  });
});
