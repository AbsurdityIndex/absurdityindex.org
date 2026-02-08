import assert from 'node:assert/strict';
import test from 'node:test';

import { toCategorySlug, toSponsorSlug } from '../src/utils/directory.js';

test('toCategorySlug matches category route expectations', () => {
  assert.equal(toCategorySlug('Food & Drink'), 'food-drink');
  assert.equal(toCategorySlug('National Security'), 'national-security');
});

test('toSponsorSlug produces stable URL-safe slugs', () => {
  assert.equal(toSponsorSlug('Rep. Wifi McRouterface (D-CA)'), 'rep-wifi-mcrouterface-d-ca');
  assert.equal(toSponsorSlug('Sen. Ada Lovelace (I-NY)'), 'sen-ada-lovelace-i-ny');
});
