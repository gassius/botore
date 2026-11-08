/* eslint-disable @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Base-pack AAC placeholders ship as Metro assets (F6). Catalogue packs are
// downloaded on demand and must not be required() into the bundle.
const assetExts = new Set(config.resolver.assetExts ?? []);
assetExts.add('m4a');
config.resolver.assetExts = Array.from(assetExts);

module.exports = config;
