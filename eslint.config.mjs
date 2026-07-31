// Accessibility-focused ESLint setup (eslint-plugin-jsx-a11y). Deliberately
// narrow: this exists to mechanically find the "missing semantic headings,
// clickable divs, unnamed icon buttons, placeholder-only fields, modals
// without focus management" class of issue from the WorshipFlow audit, not to
// enforce a general style guide — so it stays a small, reviewable diff rather
// than a wall of unrelated lint noise.
import tsParser from '@typescript-eslint/parser'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: ['out/**', 'dist-installer/**', 'build/**', 'resources/**', 'node_modules/**']
  },
  {
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    // react-hooks is registered (plugin only, no rules enabled) purely so the
    // codebase's existing `eslint-disable-next-line react-hooks/exhaustive-deps`
    // comments resolve to a real rule instead of erroring as "unknown rule" —
    // turning its rules on pulls in a large, unrelated ruleset (including
    // React Compiler-era rules like set-state-in-effect/immutability) that has
    // nothing to do with this config's actual purpose, the jsx-a11y rules below.
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules
    }
  }
]
