#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'trip-route-fetcher/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(JSON.parse(data));
      });
    }).on('error', reject);
  });
}

const html = fs.readFileSync('trip.html', 'utf8');
const match = html.match(/const DAYS = (\[[\s\S]*?\n\];)/);
if (!match) { console.error('Could not extract DAYS from trip.html'); process.exit(1); }

let DAYS;
try {
  DAYS = vm.runInNewContext(match[1]);
} catch (e) {
  console.error('Failed to parse DAYS:', e.message);
  process.exit(1);
}

async function main() {
  const result = {};

  for (let i = 0; i < DAYS.length; i++) {
    const day = DAYS[i];
    const coords = day.stops.filter(s => s.coords).map(s => s.coords);

    if (coords.length < 2) {
      result[day.id] = coords;
      console.log(`Day ${day.id} (${day.short}): skipped (< 2 stops)`);
      continue;
    }

    const waypoints = coords.map(([lat, lon]) => `${lon},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;

    try {
      const data = await httpsGet(url);
      if (!data.routes?.[0]) throw new Error('no route returned');
      // OSRM returns [lon, lat]; Leaflet needs [lat, lon]
      const geometry = data.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      result[day.id] = geometry;
      console.log(`Day ${day.id} (${day.short}): ✓ ${geometry.length} points`);
    } catch (err) {
      result[day.id] = coords; // straight-line fallback
      console.log(`Day ${day.id} (${day.short}): ⚠ fallback (${err.message})`);
    }

    if (i < DAYS.length - 1) await new Promise(r => setTimeout(r, 300));
  }

  fs.writeFileSync('trip-routes.json', JSON.stringify(result));
  console.log('\n✓ Wrote trip-routes.json');
}

main().catch(err => { console.error(err); process.exit(1); });
