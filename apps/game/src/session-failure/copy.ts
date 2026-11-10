import type { SessionFailureKind } from './classify';

export type SessionFailureCopy = {
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
};

/** Art Direction §11.3 — actionable failure/retry copy; keep short and consistent. */
export const SESSION_FAILURE_COPY: Record<'offline' | 'auth_expired', SessionFailureCopy> = {
  offline: {
    title: "You're offline",
    detail: 'Check your connection and try again.',
    actionLabel: 'Retry',
  },
  auth_expired: {
    title: 'Session expired',
    detail: 'Sign in again to continue.',
    actionLabel: 'Sign in again',
  },
};

export function sessionFailureCopy(kind: Exclude<SessionFailureKind, 'other'>): SessionFailureCopy {
  return SESSION_FAILURE_COPY[kind];
}
