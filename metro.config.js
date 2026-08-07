// Metro config. The only customization is letting the bundler treat `.wasm`
// as an asset — expo-sqlite ships a WebAssembly build for the web platform
// (node_modules/expo-sqlite/web/wa-sqlite/wa-sqlite.wasm) that Metro must be
// able to copy through, otherwise `expo export --platform web` fails to resolve
// the module. Harmless for native bundles.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro >= 0.76 exposes this under `resolver`; keep a fallback for older layouts.
const assetExts = config.resolver?.assetExts ?? config.assetExts;
if (Array.isArray(assetExts) && !assetExts.includes('wasm')) {
  assetExts.push('wasm');
}

module.exports = config;
