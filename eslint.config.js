// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*'],
    rules: {
      // This rule (new in react-hooks v5) flags the idiomatic "load data in an
      // effect" pattern used across every data hook in the app, e.g.
      //   useEffect(() => { void refresh() }, [refresh])
      // where refresh sets `loading` synchronously. That pattern is standard
      // React for async loading and the React Compiler migration is a larger,
      // separate effort, so the rule is disabled project-wide.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // Test files: Jest mocking and the `jest.resetModules()` pattern require
    // dynamic `require` (a static import would hold a stale module after the
    // registry reset). Source files are unaffected by this override.
    files: ['src/__tests__/**/*.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', 'jest.setup.js'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
