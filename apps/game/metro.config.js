/* eslint-disable @typescript-eslint/no-require-imports */
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Sentry Metro serializer assigns Debug IDs for release source maps (R3).
const config = getSentryExpoConfig(__dirname);

// Base-pack AAC placeholders ship as Metro assets (F6). Catalogue packs are
// downloaded on demand and must not be required() into the bundle.
const assetExts = new Set(config.resolver.assetExts ?? []);
assetExts.add('m4a');
config.resolver.assetExts = Array.from(assetExts);

module.exports = config;
