import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { garageTag } from '../garage-tag';
import {
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_LAST_UPDATED,
  PRIVACY_POLICY_TITLE,
  privacyPolicySections,
} from './privacyPolicyContent';
import {
  DOCUMENTED_ACCOUNT_DELETE_PATH,
  PUBLIC_PRIVACY_PATH,
  isAbsoluteHttpUrl,
  publicWebHref,
} from './privacyPaths';

function openHref(href: string): void {
  void Linking.openURL(href).catch(() => {
    // Relative / missing-origin hrefs must not become unhandled rejections.
  });
}

/** Shared Garage Tag body for in-app + public privacy disclosure. */
export function PrivacyPolicyBody(props: {
  /** When false, omit the deletion link row (rare); default shows path / absolute link. */
  showDeletionLink?: boolean;
}): React.ReactElement {
  const privacyHref = publicWebHref(PUBLIC_PRIVACY_PATH);
  const deletionHref = publicWebHref(DOCUMENTED_ACCOUNT_DELETE_PATH);
  const showDeletion = props.showDeletionLink !== false;
  const deletionLinkable = showDeletion && isAbsoluteHttpUrl(deletionHref);

  return (
    <View style={styles.root} testID="privacy-policy-body">
      <Text style={styles.title} allowFontScaling testID="privacy-policy-title">
        {PRIVACY_POLICY_TITLE}
      </Text>
      <Text style={styles.meta} allowFontScaling>
        Last updated {PRIVACY_POLICY_LAST_UPDATED}
      </Text>
      <Text style={styles.body} allowFontScaling>
        {PRIVACY_POLICY_INTRO}
      </Text>

      {privacyPolicySections.map((section) => (
        <View key={section.id} style={styles.section} testID={`privacy-section-${section.id}`}>
          <Text style={styles.heading} allowFontScaling>
            {section.title}
          </Text>
          {section.paragraphs.map((paragraph, index) => (
            <Text key={`${section.id}-${index}`} style={styles.body} allowFontScaling>
              {paragraph}
            </Text>
          ))}
        </View>
      ))}

      <View style={styles.section}>
        <Text style={styles.heading} allowFontScaling>
          Links
        </Text>
        <Text style={styles.body} allowFontScaling testID="privacy-path-label">
          Privacy path: {privacyHref}
        </Text>
        {showDeletion ? (
          deletionLinkable ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => openHref(deletionHref)}
              testID="privacy-open-account-delete"
            >
              <Text style={styles.link} allowFontScaling>
                Account deletion: {deletionHref}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.body} allowFontScaling testID="privacy-account-delete-text">
              Account deletion: {deletionHref}
            </Text>
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: garageTag.graphite,
    textTransform: 'uppercase',
  },
  meta: {
    fontSize: 12,
    fontWeight: '700',
    color: garageTag.steel,
  },
  section: {
    gap: 8,
  },
  heading: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: garageTag.mustard,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: garageTag.graphite,
  },
  link: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: garageTag.oxide,
    textDecorationLine: 'underline',
  },
});
