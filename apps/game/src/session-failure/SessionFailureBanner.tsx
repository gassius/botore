import React from 'react';
import { StatusErrorBanner } from '../garage-tag';
import type { SessionFailureKind } from './classify';
import { sessionFailureCopy } from './copy';

export type SessionFailureBannerProps = {
  readonly kind: Exclude<SessionFailureKind, 'other'>;
  /** Optional technical detail appended under the player-facing copy. */
  readonly detail?: string | null;
  readonly testID?: string;
};

/** Shared offline / auth-expired banner — F8/F9 StatusErrorBanner chrome. */
export function SessionFailureBanner({
  kind,
  detail,
  testID,
}: SessionFailureBannerProps): React.ReactElement {
  const copy = sessionFailureCopy(kind);
  const trimmed = detail?.trim() ?? '';
  const combined =
    trimmed.length > 0 && trimmed !== copy.detail ? `${copy.detail} ${trimmed}` : copy.detail;
  return testID ? (
    <StatusErrorBanner title={copy.title} detail={combined} testID={testID} />
  ) : (
    <StatusErrorBanner title={copy.title} detail={combined} />
  );
}
