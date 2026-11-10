import React from 'react';
import { BrandWordmark, ScreenChrome, ScreenHeader } from '../garage-tag';
import { PrivacyPolicyBody } from './PrivacyPolicyBody';

/**
 * R6 public web privacy page (`/privacy`).
 * No session required — store reviewers and listing URL consumers.
 */
export function PublicPrivacyPolicyScreen(): React.ReactElement {
  return (
    <ScreenChrome testID="slot-public-privacy-policy">
      <BrandWordmark width={160} />
      <ScreenHeader title="Privacy" />
      <PrivacyPolicyBody />
    </ScreenChrome>
  );
}
