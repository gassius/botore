import React from 'react';
import { BrandWordmark, SecondaryButton, ScreenChrome, ScreenHeader } from '../garage-tag';
import { PrivacyPolicyBody } from './PrivacyPolicyBody';

/** In-app privacy disclosure (Stable entry until C9 Settings merges). */
export function PrivacyPolicyScreen(props: { onBack: () => void }): React.ReactElement {
  return (
    <ScreenChrome
      testID="slot-privacy-policy"
      footer={<SecondaryButton label="Back" onPress={props.onBack} testID="privacy-policy-back" />}
    >
      <BrandWordmark width={160} />
      <ScreenHeader title="Privacy" />
      <PrivacyPolicyBody />
    </ScreenChrome>
  );
}
