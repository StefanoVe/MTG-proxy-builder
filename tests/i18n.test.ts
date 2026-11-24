import test from 'node:test';
import assert from 'node:assert/strict';
import { errorMessage, LocalizedError, resolveLocale, translate } from '../src/shared/i18n.ts';

test('selects the first supported system language and falls back to English', () => {
  assert.equal(resolveLocale(['fr-FR', 'it-IT', 'en-GB']), 'it');
  assert.equal(resolveLocale(['en-GB', 'it-IT']), 'en');
  assert.equal(resolveLocale(['ja-JP']), 'en');
});

test('translates dynamic messages while preserving the supplied card names and error values', () => {
  const name = 'Fulmine {count}';
  assert.equal(translate('it', 'selectCard', { name }), 'Seleziona Fulmine {count}');
  assert.equal(translate('en', 'selectCard', { name }), 'Select Fulmine {count}');
  const error = new LocalizedError('catalogStatus', { status: 503 });
  assert.equal(errorMessage(error, 'en'), 'The catalog returned error 503.');
  assert.equal(errorMessage(error, 'it'), 'Il catalogo ha risposto con errore 503.');
});
