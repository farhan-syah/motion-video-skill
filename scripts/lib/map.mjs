// Maps from Natural Earth country outlines (public domain, via world-atlas): a Mercator view fitted to countries, a
// box or points, with highlighted countries, pins and great-circle routes. The SVG keeps one element per part, with
// stable ids, so a scene can animate them (a route draws on with data-draw, a pin pops in, a country fills).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoArea, geoInterpolate, geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const slug = (t) => t.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// "Label@lon,lat", "@lon,lat" or "lon,lat".
export function parsePlace(spec) {
  const m = /^(?:(.*)@)?\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(spec);
  if (!m) throw new Error(`"${spec}" is not a place. Write Label@lon,lat (Penang@100.33,5.41), or lon,lat with no label.`);
  const lon = Number(m[2]);
  const lat = Number(m[3]);
  if (Math.abs(lon) > 180 || Math.abs(lat) > 90) throw new Error(`"${spec}": longitude comes first (-180 to 180), then latitude (-90 to 90).`);
  return { label: m[1]?.trim() || null, lon, lat };
}

// d3 reads a polygon's ring order as its inside: a ring wound the other way (RFC 7946 GeoJSON, some Natural Earth
// islands) fills the whole globe except the shape, and draws as a box over the frame. Such a shape covers more than
// half the sphere, so its rings are reversed. Each polygon of a multipolygon is judged alone: one inverted islet in
// the 10m Maldives covers the globe.
function rewind(f) {
  const g = f.geometry;
  if (!/Polygon/.test(g?.type ?? '')) return f;
  const fix = (poly) => (geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map((ring) => [...ring].reverse()) : poly);
  return { ...f, geometry: { ...g, coordinates: g.type === 'Polygon' ? fix(g.coordinates) : g.coordinates.map(fix) } };
}

// A GeoJSON file as a list of features.
function geojson(file) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`map: ${file} is not readable GeoJSON (${e.message.split('\n')[0]}).`);
  }
  const list = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : data.coordinates ? [{ type: 'Feature', properties: {}, geometry: data }] : null;
  if (!list) throw new Error(`map: ${file} holds no GeoJSON features.`);
  return list.map(rewind);
}

export function countryNames(detail = '50m') {
  const topo = JSON.parse(readFileSync(require.resolve(`world-atlas/countries-${detail}.json`), 'utf8'));
  return feature(topo, topo.objects.countries).features.map((f) => f.properties.name).sort();
}

// width, height: pixels. fit: country names the view frames. bbox: [lon1, lat1, lon2, lat2]. With neither, the view
// frames the pins and routes. highlight: country names. pins: places. routes: lists of places, joined by great-circle
// arcs. land: a GeoJSON file whose polygons replace the country outlines. layers: GeoJSON files drawn over the land.
export function drawMap({ width, height, detail = '50m', fit = [], bbox = null, highlight = [], pins = [], routes = [], land: landFile = null, layers = [], pad = 0.08 }) {
  if (!['10m', '50m', '110m'].includes(detail)) throw new Error(`map --detail must be 10m, 50m or 110m, got "${detail}".`);
  const topo = JSON.parse(readFileSync(require.resolve(`world-atlas/countries-${detail}.json`), 'utf8'));
  const countries = feature(topo, topo.objects.countries).features.map(rewind);
  const byName = new Map(countries.map((f) => [f.properties.name.toLowerCase(), f]));
  const find = (name) => {
    const f = byName.get(name.toLowerCase());
    if (f) return f;
    const near = [...byName.keys()].filter((k) => k.includes(name.toLowerCase().slice(0, 4))).slice(0, 6);
    throw new Error(`map: no country "${name}"${near.length ? `. Close names: ${near.join(', ')}` : ''}. List every name with map --countries.`);
  };
  const fitShapes = fit.map(find);
  const points = [...pins, ...routes.flat()].map((p) => [p.lon, p.lat]);
  let target;
  if (bbox) target = { type: 'MultiPoint', coordinates: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] };
  else if (fitShapes.length) target = { type: 'FeatureCollection', features: fitShapes };
  else if (points.length > 1) target = { type: 'MultiPoint', coordinates: points };
  else throw new Error('map: say what to frame: --fit countries, --bbox, or two or more --pin or --route places.');
  // Pins and routes near the frame edge need room for their labels.
  const px = Math.round(Math.min(width, height) * (fitShapes.length || bbox ? pad : Math.max(pad, 0.16)));
  const projection = geoMercator().fitExtent([[px, px], [width - px, height - px]], target).clipExtent([[-4, -4], [width + 4, height + 4]]);
  const path = geoPath(projection).digits(1);
  const hl = new Set(highlight.map((n) => find(n).properties.name));
  const own = landFile ? geojson(landFile) : null;
  const land = own
    ? own.map((f, i) => { const d = path(f); return d ? `<path class="country" id="land-${i + 1}" d="${d}"/>` : ''; }).filter(Boolean)
    : countries.map((f) => {
      const d = path(f);
      if (!d) return '';
      const name = f.properties.name;
      return `<path class="country${hl.has(name) ? ' hl' : ''}" id="c-${slug(name)}" data-name="${esc(name)}" d="${d}"/>`;
    })
    .filter(Boolean);
  const where = (p) => projection([p.lon, p.lat]).map((v) => +v.toFixed(1));
  // A route through several places is one path, so it draws on as one stroke.
  const routeEls = routes.map((stops, i) => {
    if (stops.length < 2) throw new Error(`map: route ${i + 1} needs two or more places joined by ">".`);
    const coordinates = [[stops[0].lon, stops[0].lat]];
    for (let s = 1; s < stops.length; s++) {
      const arc = geoInterpolate([stops[s - 1].lon, stops[s - 1].lat], [stops[s].lon, stops[s].lat]);
      for (let k = 1; k <= 64; k++) coordinates.push(arc(k / 64));
    }
    return `<path class="route" id="route-${i + 1}" d="${path({ type: 'LineString', coordinates })}"/>`;
  });
  // Layer features keep their name as the id when they have one: layer-<file>-<name>, else layer-<file>-<n>.
  const layerEls = layers.flatMap((file, li) =>
    geojson(file).map((f, i) => {
      const d = path(f);
      if (!d) return '';
      const name = f.properties?.name;
      const kind = /Polygon/.test(f.geometry.type) ? 'area' : /Line/.test(f.geometry.type) ? 'line' : 'point';
      return `<path class="layer ${kind}" id="layer-${li + 1}-${name ? slug(name) : i + 1}"${name ? ` data-name="${esc(name)}"` : ''} d="${d}"/>`;
    }).filter(Boolean));
  const placed = pins.map((p) => ({ ...p, id: `pin-${slug(p.label ?? `${p.lon}-${p.lat}`)}`, at: where(p) }));
  // Labels sit right of the pin, left in the right third of the frame, and step down past a label they would cover.
  const LINE = 36;
  const taken = [];
  for (const p of placed) {
    p.side = p.at[0] > width * 0.66 ? 'left' : 'right';
    p.dy = 0;
    const w = (p.label?.length ?? 0) * 17 + 16;
    const box = () => {
      const x0 = p.side === 'right' ? p.at[0] + 14 : p.at[0] - 14 - w;
      return { x0, x1: x0 + w, y: p.at[1] + p.dy };
    };
    while (taken.some((t) => { const b = box(); return b.x0 < t.x1 && t.x0 < b.x1 && Math.abs(b.y - t.y) < LINE; })) p.dy += LINE;
    taken.push(box());
  }
  // The position sits on an outer group, so an animated transform on the pin (a pop, a bounce) scales about the pin
  // itself and never moves it.
  const pinEls = placed.map((p) => {
    const text = p.label ? `<text x="${p.side === 'right' ? 16 : -16}" y="${10 + p.dy}" text-anchor="${p.side === 'right' ? 'start' : 'end'}">${esc(p.label)}</text>` : '';
    return `<g transform="translate(${p.at[0]} ${p.at[1]})"><g class="pin" id="${p.id}"><circle r="8"/>${text}</g></g>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="map" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
<style>
:where(.map) .country { fill: var(--map-land, #d9cfb4); stroke: var(--map-border, #f4efe2); stroke-width: 0.8; }
:where(.map) .country.hl { fill: var(--map-hl, #e8b73a); }
:where(.map) .route { fill: none; stroke: var(--map-route, #c8322b); stroke-width: 3; stroke-linecap: round; }
:where(.map) .layer.area { fill: var(--map-area, var(--map-hl, #e8b73a)); }
:where(.map) .layer.line { fill: none; stroke: var(--map-line, var(--map-route, #c8322b)); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
:where(.map) .pin circle { fill: var(--map-pin, #c8322b); stroke: #fff; stroke-width: 2.5; }
:where(.map) .pin text { font: 700 28px var(--mono, monospace); fill: var(--map-label, #1b1b1b); }
</style>
<g class="land">
${land.join('\n')}
</g>
<g class="layers">
${layerEls.join('\n')}
</g>
<g class="routes">
${routeEls.join('\n')}
</g>
<g class="pins">
${pinEls.join('\n')}
</g>
</svg>
`;
  return { svg, pins: placed, countries: land.length };
}
