#!/usr/bin/env node
/**
 * Aura Canvas Manifest - Add / Import Tool
 *
 * Usage:
 *   node scripts/add-canvas.js --song "Title" --artist "Artist" --url "https://..."
 *   node scripts/add-canvas.js --import new-canvases.json
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'canvas.json');

function loadManifest() {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw);
}

function saveManifest(manifest) {
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log('✅ Manifest updated:', MANIFEST_PATH);
}

function normalize(str) {
  return (str || '').trim().toLowerCase();
}

function addEntry(manifest, entry) {
  const { song, artist, url, trackId, duration } = entry;

  if (!song || !artist || !url) {
    console.error('❌ Missing required fields: song, artist, url');
    process.exit(1);
  }

  // Avoid exact duplicates (by url or by song+artist+url)
  const exists = manifest.items.some(item =>
    item.url === url ||
    (normalize(item.song) === normalize(song) &&
     normalize(item.artist) === normalize(artist) &&
     item.url === url)
  );

  if (exists) {
    console.log(`⚠️  Duplicate skipped: ${song} - ${artist}`);
    return;
  }

  const newItem = {
    song: song.trim(),
    artist: artist.trim(),
    url: url.trim(),
  };

  if (trackId) newItem.trackId = trackId.trim();
  if (duration) newItem.duration = parseInt(duration, 10);

  manifest.items.push(newItem);

  // Sort by artist then song for nicer diffs
  manifest.items.sort((a, b) => {
    const artistCompare = a.artist.localeCompare(b.artist);
    if (artistCompare !== 0) return artistCompare;
    return a.song.localeCompare(b.song);
  });

  console.log(`✅ Added: ${song} - ${artist}`);
}

function main() {
  const args = process.argv.slice(2);
  const manifest = loadManifest();

  if (args.includes('--import')) {
    const importPath = args[args.indexOf('--import') + 1];
    if (!importPath) {
      console.error('Usage: node scripts/add-canvas.js --import path/to/file.json');
      process.exit(1);
    }

    const importData = JSON.parse(fs.readFileSync(importPath, 'utf8'));
    const items = Array.isArray(importData) ? importData : (importData.items || []);

    let added = 0;
    for (const item of items) {
      const before = manifest.items.length;
      addEntry(manifest, item);
      if (manifest.items.length > before) added++;
    }
    saveManifest(manifest);
    console.log(`\nImported ${added} new entries.`);
    return;
  }

  // Single entry mode
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : null;
  };

  const entry = {
    song: getArg('song'),
    artist: getArg('artist'),
    url: getArg('url'),
    trackId: getArg('trackId'),
    duration: getArg('duration'),
  };

  if (!entry.song || !entry.artist || !entry.url) {
    console.log(`
Usage:
  Add single entry:
    node scripts/add-canvas.js --song "Song" --artist "Artist" --url "https://..." [--trackId "xxx"] [--duration 30]

  Bulk import:
    node scripts/add-canvas.js --import new-canvases.json
`);
    process.exit(1);
  }

  addEntry(manifest, entry);
  saveManifest(manifest);
}

main();
