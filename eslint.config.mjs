/** Validate runtime, standalone scripts and pure geometry source in CI.
 * The package still has ZERO third-party runtime dependencies; lint is dev-only.
 */
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'reports/**', '.cache/**'] },
  {
    files: ['src/**/*.ts', 'bin/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Legacy browser-injected adapters deliberately use loose CDP payload types.
      // Introduce typed coverage gradually rather than disabling useful rules.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    }
  }
);
