'use strict';
// ESLint — périmètre volontairement restreint au noyau et aux tests.
// Le legacy (server.js, main.py côté Python, generate.js…) est exclu :
// on ne lint pas 2 000 lignes qui fonctionnent pour le plaisir de créer
// 400 avertissements ; le legacy se nettoie quand on le touche (strangler).
const js = require('@eslint/js');

module.exports = [
  {
    files: ['core/**/*.js', 'tests/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', process: 'readonly',
        console: 'readonly', Buffer: 'readonly', URL: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        setTimeout: 'readonly', fetch: 'readonly', __dirname: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
];
