/**
 * ESLint flat config for the project.
 * This is the modern flat-config used by ESLint 9+.
 */
/**
 * ESLint flat config for the project.
 * This is the modern flat-config used by ESLint 9+.
 */
module.exports = [
  {
    files: ['**/*.js'],
    ignores: ['node_modules/**', '.git/**', 'dist/**'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      indent: ['error', 2],
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'single'],
      semi: ['error', 'always'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'max-len': ['warn', { code: 100 }],
      camelcase: 'warn',
      'no-var': 'error',
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
    },
  },
];
