import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeSvg, defaults, gradients, normalizeHex, parseCatalog, preferences } from '../panel/compose.mjs';

const ids = 'A1 B1 D1 E1 F1 G1 H1 H2 I1 J1 K2 L2 M1 N1 O1 P3 Q1 R3 S2 T1'.split(' ');
const names = 'Orca|Dolphin|Beluga|Sea Otter|Manta Ray|Octopus|Humpback|Seal|Sea Turtle|Crab|Pufferfish|Seahorse|Jellyfish|Shark|Clownfish|Walrus|Hammerhead|Narwhal|Penguin|Sea Bunny'.split('|');
const root = new URL('../', import.meta.url);
const rows = parseCatalog(JSON.parse(readFileSync(new URL('panel/catalog.json', root), 'utf8')));
const image = 'data:image/webp;base64,' + readFileSync(new URL(rows[0].asset, root)).toString('base64');

test('catalog contains the twenty named mascots and packaged WebPs', () => {
  assert.deepEqual(rows.map(row => row.id), ids);
  assert.deepEqual(rows.map(row => row.name), names);
  for (const row of rows) {
    const bytes = readFileSync(new URL(row.asset, root));
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  }
  assert.throws(() => parseCatalog([rows[0], rows[0]]));
  assert.throws(() => parseCatalog([{ ...rows[0], asset: 'other.webp' }]));
});

test('hex accepts short and long colours and rejects malformed input', () => {
  assert.equal(normalizeHex(' #aBc '), '#AABBCC');
  assert.equal(normalizeHex('0001ff'), '#0001FF');
  for (const bad of [null, 3, 'ab', '#abcd', 'red', '#000000"', 'url(#bg)']) {
    assert.equal(normalizeHex(bad), null);
  }
});

test('solid SVG embeds the foreground, escapes titles and constrains fills', () => {
  const svg = composeSvg(defaults, '<&"\'>', image);
  assert.ok(svg.includes('&lt;&amp;&quot;&apos;&gt;'));
  assert.ok(svg.includes('fill="#B3DBF4"'));
  assert.ok(svg.includes('href="' + image + '"'));
  assert.throws(() => composeSvg(defaults, 'Mascot', 'https://example.invalid/image'));
  assert.throws(() => composeSvg({ ...defaults, background: 'custom', custom: '"<x>' }, 'Test', image));
});

test('gradient uses its own SVG definition and transparent export omits the backdrop', () => {
  for (const [background, [, first, last]] of Object.entries(gradients)) {
    const svg = composeSvg({ ...defaults, background }, 'Test', image);
    for (const part of ['linearGradient', 'url(#bg)', first, last]) assert.ok(svg.includes(part));
  }
  const svg = composeSvg({ ...defaults, background: 'transparent', size: 1024, shape: 'circle' }, 'Test', image);
  assert.ok(svg.includes('width="1024" height="1024"'));
  assert.doesNotMatch(svg, /<rect|<circle|clipPath|checker/);
});

test('preferences recover from invalid or partial older records', () => {
  for (const raw of [null, 'invalid json', '[]', '42', '{"mascot":"ZZ","size":4096,"background":"constructor"}']) {
    assert.deepEqual(preferences(raw, rows), defaults);
  }
  const restored = preferences('{"mascot":"J1","custom":"abc","background":"custom"}', rows);
  assert.deepEqual(restored, { ...defaults, mascot: 'J1', background: 'custom', custom: '#AABBCC' });
  const valid = { ...defaults, size: 1024, shape: 'circle', background: 'transparent' };
  assert.deepEqual(preferences(JSON.stringify(valid), rows), valid);
});
