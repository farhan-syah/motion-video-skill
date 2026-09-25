import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { drawMap, parsePlace } from './map.mjs';

test('a place reads as Label@lon,lat, longitude first', () => {
  assert.deepEqual(parsePlace('Penang@100.33,5.41'), { label: 'Penang', lon: 100.33, lat: 5.41 });
  assert.throws(() => parsePlace('Penang@5.41,200'), /longitude comes first/);
});

test('a map frames its countries, highlights them, and gives pins and routes stable ids', () => {
  const { svg, pins } = drawMap({
    width: 1080, height: 1920, detail: '110m', fit: ['Malaysia'], highlight: ['Malaysia'],
    pins: [parsePlace('Kuala Lumpur@101.69,3.14')], routes: [[parsePlace('London@-0.13,51.5'), parsePlace('Kuala Lumpur@101.69,3.14')]],
  });
  assert.match(svg, /class="country hl" id="c-malaysia"/);
  assert.match(svg, /id="route-1"/);
  assert.equal(pins[0].id, 'pin-kuala-lumpur');
  const [x, y] = pins[0].at;
  assert.ok(x > 0 && x < 1080 && y > 0 && y < 1920, 'the pin lands inside the frame');
});

test('an unknown country fails with close names', () => {
  assert.throws(() => drawMap({ width: 100, height: 100, detail: '110m', fit: ['Malasia'] }), /Close names: .*malaysia/);
});

test('no inside-out islet fills a zoomed 10m view', () => {
  const { svg } = drawMap({ width: 1080, height: 1920, detail: '10m', bbox: [100.2, 5.2, 100.5, 5.5] });
  assert.doesNotMatch(svg, /id="c-maldives"/);
});

test('a place can have no label, and a route can pass through several places as one path', () => {
  assert.deepEqual(parsePlace('@100.34,5.41'), { label: null, lon: 100.34, lat: 5.41 });
  const { svg } = drawMap({ width: 1080, height: 1920, bbox: [100.2, 5.2, 100.5, 5.5], routes: [['100.34,5.41', '100.36,5.40', '100.38,5.39'].map(parsePlace)] });
  assert.equal(svg.match(/class="route"/g).length, 1);
});

test('GeoJSON layers draw with ids from their names, whatever their ring order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'map-test-'));
  const file = join(dir, 'layer.geojson');
  // RFC 7946 order: the exterior ring runs counterclockwise.
  writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { name: 'Penang Bridge' }, geometry: { type: 'LineString', coordinates: [[100.357, 5.357], [100.43, 5.37]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[100.3, 5.3], [100.35, 5.3], [100.35, 5.35], [100.3, 5.35], [100.3, 5.3]]] } },
  ] }));
  const { svg } = drawMap({ width: 1080, height: 1920, bbox: [100.2, 5.2, 100.5, 5.5], layers: [file] });
  assert.match(svg, /class="layer line" id="layer-1-penang-bridge"/);
  const area = svg.match(/id="layer-1-2" d="([^"]+)"/)[1];
  assert.doesNotMatch(area, /L1084,-4/, 'the area stays a small box, not the whole frame');
  rmSync(dir, { recursive: true, force: true });
});
