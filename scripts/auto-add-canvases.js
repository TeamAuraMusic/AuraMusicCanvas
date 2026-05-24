#!/usr/bin/env node
/**
 * AuraMusicCanvas - Auto fetch + add script
 *
 * Usage:
 *   node scripts/auto-add-canvases.js --input tracks.txt
 *   node scripts/auto-add-canvases.js --input tracks.txt --auto-import
 *
 * tracks.txt format (one per line, # comments allowed):
 *   40j4RoqmLiivqzRObbQ4BF
 *   0VjIjW4GlUZAMYd2vXMi3b   # Blinding Lights
 *
 * Requires the Spotify-Canvas-API to be running locally:
 *   cd ~/Spotify-Canvas-API && node index.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'canvas.json');
const CANVAS_API = process.env.CANVAS_API || 'http://localhost:3000';

function parseArgs() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const inputFile = inputIdx !== -1 ? args[inputIdx + 1] : null;
  const autoImport = args.includes('--auto-import') || args.includes('--import');
  const dryRun = args.includes('--dry-run');

  if (!inputFile) {
    console.error(`
Usage:
  node scripts/auto-add-canvases.js --input tracks.txt [--auto-import] [--dry-run]

Examples:
  node scripts/auto-add-canvases.js --input my-tracks.txt
  node scripts/auto-add-canvases.js --input my-tracks.txt --auto-import
`);
    process.exit(1);
  }

  return { inputFile, autoImport, dryRun };
}

function readTrackIds(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(/\s+/)[0]); // take first token (the ID)
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'AuraMusicCanvas/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Invalid JSON from ' + url));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        }
      });
    }).on('error', reject);
  });
}

async function getCanvasData(trackId) {
  const url = `${CANVAS_API}/api/canvas?trackId=${trackId}`;
  try {
    const res = await httpGet(url);
    const list = res.canvasesList || res.data?.canvasesList || [];
    if (list.length === 0) return null;

    const first = list[0];
    return {
      canvasUrl: first.canvasUrl,
      trackUri: first.trackUri,
      artistName: first.artist?.artistName || null,
    };
  } catch (err) {
    console.error(`  ⚠️  Canvas API error for ${trackId}: ${err.message}`);
    return null;
  }
}

async function getTrackInfo(trackId) {
  // Use Spotify oEmbed (no auth required)
  const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`;
  try {
    const data = await httpGet(oembedUrl);
    return {
      title: data.title || 'Unknown',
      artist: data.author_name || 'Unknown Artist',
    };
  } catch (err) {
    console.error(`  ⚠️  Could not fetch title/artist for ${trackId}`);
    return { title: 'Unknown', artist: 'Unknown Artist' };
  }
}

async function processTracks(trackIds) {
  const results = [];

  for (const trackId of trackIds) {
    process.stdout.write(`→ Processing ${trackId} ... `);

    const canvas = await getCanvasData(trackId);
    if (!canvas || !canvas.canvasUrl) {
      console.log('no canvas');
      continue;
    }

    const info = await getTrackInfo(trackId);

    // Prefer artist from canvas response if available
    const artist = canvas.artistName || info.artist;

    const entry = {
      song: info.title,
      artist: artist,
      url: canvas.canvasUrl,
      trackId,
    };

    results.push(entry);
    console.log(`found: ${artist} - ${info.title}`);
  }

  return results;
}

function importToManifest(entries, dryRun) {
  if (entries.length === 0) {
    console.log('\nNo new canvases found.');
    return;
  }

  const tempFile = path.join(__dirname, '..', 'new-canvases-auto.json');
  fs.writeFileSync(tempFile, JSON.stringify(entries, null, 2));

  console.log(`\nPrepared ${entries.length} new canvas(es).`);

  if (dryRun) {
    console.log('Dry run — not importing. File saved to:', tempFile);
    console.log('You can import manually with:');
    console.log(`  node scripts/add-canvas.js --import ${tempFile}`);
    return;
  }

  console.log('Importing into manifest...');
  try {
    execSync(`node ${path.join(__dirname, 'add-canvas.js')} --import ${tempFile}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    fs.unlinkSync(tempFile);
    console.log('✅ Import complete.');
  } catch (e) {
    console.error('Import failed. Temp file left at:', tempFile);
  }
}

async function main() {
  const { inputFile, autoImport, dryRun } = parseArgs();

  console.log(`AuraMusicCanvas Auto-Add`);
  console.log(`Using Canvas API: ${CANVAS_API}`);
  console.log(`Input file: ${inputFile}\n`);

  const trackIds = readTrackIds(inputFile);
  if (trackIds.length === 0) {
    console.error('No track IDs found in input file.');
    process.exit(1);
  }

  console.log(`Found ${trackIds.length} track ID(s) to check.\n`);

  const newEntries = await processTracks(trackIds);

  if (newEntries.length > 0) {
    console.log(`\nFound ${newEntries.length} canvas(es) with valid URLs.`);
  }

  if (autoImport) {
    importToManifest(newEntries, dryRun);
  } else if (newEntries.length > 0) {
    const tempFile = path.join(__dirname, '..', 'new-canvases-auto.json');
    fs.writeFileSync(tempFile, JSON.stringify(newEntries, null, 2));
    console.log(`\nSaved ready-to-import file: ${tempFile}`);
    console.log('Run this to add them:');
    console.log(`  node scripts/add-canvas.js --import ${tempFile}`);
  } else {
    console.log('\nNothing to add.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
