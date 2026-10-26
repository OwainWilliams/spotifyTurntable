// ESLint flat config. The react-hooks plugin is the one that earns its keep
// here: it catches missing effect dependencies and other hook misuse, the
// class of bug behind the "first key after idle" fix.
// .NET analogy: Roslyn analyzers, run by `npm run lint` and in CI.
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.js'],
    languageOptions: { globals: globals.node },
  },
)
