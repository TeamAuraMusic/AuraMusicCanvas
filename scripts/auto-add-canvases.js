#!/usr/bin/env node
/**
 * AuraMusicCanvas - Auto fetch + add script
 *
 * Providers:
 *   local     → Self-hosted Spotify-Canvas-API (default)
 *   paxsenix  → Hosted Paxsenix API (api.paxsenix.org)
 *
 * Usage examples:
 *   node scripts/auto-add-canvases.js --input tracks.txt
 *   node scripts/auto-add-canvases.js --input tracks.txt --provider paxsenix --auto-import
 *
 * For Paxsenix provider, set the environment variable:
 *   PAXSENIX_API_KEY=sk-paxsenix-...
 *
 * tracks.txt format:
 *   40j4RoqmLiivqzRObbQ4BF
 *   0VjIjW4GlUZAMYd2vXMi3b   # Blinding Lights
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'canvas.json');

// Config
const PROVIDER = (process.env.PROVIDER || 'local').toLowerCase();
const PAXSENIX_API_KEY = process.env.PAXSENIX_API_KEY || '';
const CANVAS_API = process.env.CANVAS_API || 'http://localhost:3000';

function parseArgs() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf('--input');
  const inputFile = inputIdx !== -1 ? args[inputIdx + 1] : null;

  const providerIdx = args.indexOf('--provider');
  const cliProvider = providerIdx !== -1 ? args[providerIdx + 1] : null;

  const autoImport = args.includes('--auto-import') || args.includes('--import');
  const dryRun = args.includes('--dry-run');

  if (!inputFile) {
    console.error(`
Usage:
  node scripts/auto-add-canvases.js --input tracks.txt [--provider local|paxsenix] [--auto-import] [--dry-run]

Examples:
  node scripts/auto-add-canvases.js --input tracks.txt
  node scripts/auto-add-canvases.js --input tracks.txt --provider paxsenix --auto-import

For Paxsenix provider, set PAXSENIX_API_KEY in your environment or .env file.
`);
    process.exit(1);
  }

  const finalProvider = cliProvider || PROVIDER;

  return { inputFile, provider: finalProvider, autoImport, dryRun };
}

function readTrackIds(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(/\s+/)[0]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getCanvasData(trackId, provider) {
  try {
    let url, options;

    if (provider === 'paxsenix') {
      if (!PAXSENIX_API_KEY) {
        throw new Error('PAXSENIX_API_KEY environment variable is required when using --provider paxsenix');
      }
      url = `https://api.paxsenix.org/spotify/canvas?id=${trackId}`;
      options = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${PAXSENIX_API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'AuraMusicCanvas/1.0'
        }
      };
    } else {
      // Local self-hosted
      url = `${CANVAS_API}/api/canvas?trackId=${trackId}`;
      options = {
        method: 'GET',
        headers: {
          'User-Agent': 'AuraMusicCanvas/1.0'
        }
      };
    }

    const res = await httpRequest(options);
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
  const oembedUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`;
  try {
    const options = {
      method: 'GET',
      headers: { 'User-Agent': 'AuraMusicCanvas/1.0' }
    };
    const data = await httpRequest(options);
    return {
      title: data.title || 'Unknown',
      artist: data.author_name || 'Unknown Artist',
    };
  } catch (err) {
    console.error(`  ⚠️  Could not fetch title/artist for ${trackId}`);
    return { title: 'Unknown', artist: 'Unknown Artist' };
  }
}

async function processTracks(trackIds, provider) {
  const results = [];
  const isPaxsenix = provider === 'paxsenix';
  const delay = isPaxsenix ? 1200 : 300; // Be nicer to hosted API

  for (const trackId of trackIds) {
    process.stdout.write(`→ Processing ${trackId} ... `);

    const canvas = await getCanvasData(trackId, provider);
    if (!canvas || !canvas.canvasUrl) {
      console.log('no canvas');
      await sleep(delay);
      continue;
    }

    const info = await getTrackInfo(trackId);

    const artist = canvas.artistName || info.artist;

    const entry = {
      song: info.title,
      artist: artist,
      url: canvas.canvasUrl,
      trackId,
    };

    results.push(entry);
    console.log(`found: ${artist} - ${info.title}`);

    await sleep(delay);
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
  const { inputFile, provider, autoImport, dryRun } = parseArgs();

  if (provider === 'paxsenix' && !PAXSENIX_API_KEY) {
    console.error('Error: PAXSENIX_API_KEY environment variable must be set when using --provider paxsenix');
    process.exit(1);
  }

  console.log(`AuraMusicCanvas Auto-Add`);
  console.log(`Provider: ${provider}`);
  if (provider === 'paxsenix') {
    console.log(`Using hosted Paxsenix API`);
  } else {
    console.log(`Using Canvas API: ${CANVAS_API}`);
  }
  console.log(`Input file: ${inputFile}\n`);

  const trackIds = readTrackIds(inputFile);
  if (trackIds.length === 0) {
    console.error('No track IDs found in input file.');
    process.exit(1);
  }

  console.log(`Found ${trackIds.length} track ID(s) to check.\n`);

  const newEntries = await processTracks(trackIds, provider);

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
