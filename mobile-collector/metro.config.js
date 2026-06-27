const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    // Prefer 'main' (CommonJS) first to avoid "import and export may only appear at top level"
    // from ESM in @react-navigation and similar; keep 'react-native' for platform-specific files.
    resolverMainFields: ['main', 'react-native', 'module'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
