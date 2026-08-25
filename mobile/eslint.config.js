const expoConfig = require('eslint-config-expo/flat');

// Globalne symbole Jest-a. Konfiguracja „flat" nie honoruje już komentarzy
// /* eslint-env jest */, więc deklarujemy je tutaj dla plików testowych.
const jestGlobals = {
  jest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
};

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**'],
  },
  {
    rules: {
      // Nieużywany import w React Native to najczęściej pozostałość po
      // przenoszeniu kodu między ekranami — w bundlu i tak zostanie.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['__tests__/**/*.js', 'test-utils/**/*.js', 'jest.setup.js', 'jest.config.js'],
    languageOptions: { globals: jestGlobals },
    rules: {
      // Atrapy modułów natywnych dopisują pola (np. __store) pod potrzeby
      // testów — analiza importów nie ma skąd o nich wiedzieć.
      'import/namespace': 'off',
    },
  },
];
