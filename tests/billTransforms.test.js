import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dedupeActionEntries,
  dedupeCongressApiActions,
  normalizeActionText,
  toDateOnlyString,
} from '../src/utils/billTransforms.js';

test('toDateOnlyString normalizes timestamps to YYYY-MM-DD', () => {
  assert.equal(toDateOnlyString('2026-02-02T05:00:00Z'), '2026-02-02');
  assert.equal(toDateOnlyString('2026-02-02'), '2026-02-02');
});

test('normalizeActionText strips tags, decodes nbsp, and collapses whitespace', () => {
  assert.equal(
    normalizeActionText(' Referred&nbsp;to <b>the</b>   Committee  '),
    'Referred to the Committee'
  );
});

test('dedupeActionEntries dedupes by date+text, ignoring chamber differences', () => {
  const date = new Date('2026-02-02T00:00:00Z');
  const actions = [
    { date, text: 'Referred to the Committee', chamber: 'house' },
    { date, text: ' Referred  to the   Committee ', chamber: 'senate' },
  ];

  const out = dedupeActionEntries(actions);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'Referred to the Committee');
});

test('dedupeCongressApiActions normalizes actionDate to date-only and dedupes', () => {
  const actions = [
    { actionDate: '2026-02-02T05:00:00Z', text: 'Referred&nbsp;to the Committee' },
    { actionDate: '2026-02-02', text: 'Referred to the Committee' },
  ];

  const out = dedupeCongressApiActions(actions);
  assert.equal(out.length, 1);
  assert.equal(out[0].actionDate, '2026-02-02');
  assert.equal(out[0].text, 'Referred to the Committee');
});

