# AuraMusicCanvas

Public, no-login-required manifest of Spotify Canvas videos for AuraMusic and other compatible players.

**Official repository:** https://github.com/TeamAuraMusic/AuraMusicCanvas
**Live endpoint:** https://canvas.auramusic.site/canvas.json

**Endpoint (after deployment):**
```
https://canvas.auramusic.site/canvas.json
```

## Format

```json
{
  "version": 1,
  "updatedAt": "2026-05-24T08:00:00Z",
  "items": [
    {
      "song": "Blinding Lights",
      "artist": "The Weeknd",
      "url": "https://canvaz.scdn.co/upload/licensor/.../video/xxx.cnvs.mp4",
      "trackId": "0VjIjW4GlUZAMYd2vXMi3b",
      "duration": 30
    }
  ]
}
```

- `song` and `artist` are used for fuzzy matching (case-insensitive substring).
- `url` should be a direct MP4 (preferably looping 5–30s canvas).
- `trackId` (Spotify ID) is highly recommended for future exact matching.
- All other fields are optional.

## Deploy to Vercel (recommended)

This repository is already set up for Vercel deployment.

1. Clone this repo:
   ```bash
   git clone https://github.com/TeamAuraMusic/AuraMusicCanvas.git
   cd AuraMusicCanvas
   ```

2. (Optional) Run the validation locally:
   ```bash
   npm run validate
   ```

3. Push any changes to the `main` branch.

4. Import (or connect) the repo at [Vercel](https://vercel.com/new) → Deploy.

Your manifest will be instantly available at:
`https://canvas.auramusic.site/canvas.json`

## Adding Canvases

### Easy way (recommended)

```bash
node scripts/add-canvas.js \
  --song "Song Title" \
  --artist "Artist Name" \
  --url "https://canvaz.scdn.co/..." \
  --trackId "spotifyTrackId"
```

This updates `public/canvas.json`, sorts entries, and updates the timestamp.

### Manual

Edit `public/canvas.json` directly and commit.

### Bulk import

Place a file `new-canvases.json` with the same shape as the manifest items array, then run:

```bash
node scripts/add-canvas.js --import new-canvases.json
```

### Automatic fetching (recommended for many tracks)

If you have the [Spotify-Canvas-API](https://github.com/Paxsenix0/Spotify-Canvas-API) running locally with your `sp_dc` cookie, you can automatically fetch canvases + song metadata:

1. Start the canvas API:
   ```bash
   cd ~/Spotify-Canvas-API && node index.js
   ```

2. Create a file `tracks.txt` with one Spotify track ID per line.

3. Run the auto script:
   ```bash
   node scripts/auto-add-canvases.js --input tracks.txt
   ```

   With auto-import:
   ```bash
   node scripts/auto-add-canvases.js --input tracks.txt --auto-import
   ```

   Or via npm:
   ```bash
   npm run auto-add -- --input tracks.txt --auto-import
   ```

An example file is provided at `tracks.example.txt`.

## Where to get Canvas URLs

**Legal & sustainable options:**

1. **User submissions** (best for open source)
   - Users who have the canvas locally (via Spicetify, mobile recording, etc.) submit the direct URL.

2. **Your own authenticated script** (advanced)
   - Use your personal Spotify `sp_dc` cookie + the internal Spotify Canvas endpoint (see Paxsenix0/Spotify-Canvas-API or similar).
   - Run the script locally or in a private GitHub Action.
   - **Never** commit your cookie.

3. **Public sources**
   - Some artists and labels publish canvas assets.
   - Community projects occasionally share lists.

**Do NOT** bulk-scrape Spotify without authentication. It violates their ToS.

## Future Plans

- Add an optional lightweight submission form (Vercel serverless function).
- Support exact `trackId` matching in AuraMusic client.
- Allow multiple canvases per track (mood variants, etc.).
- Daily/weekly automated enrichment using authenticated sources (opt-in).

## License

Licensed under the GNU General Public License v3.0 (GPL-3.0).

- Code: GPL-3.0
- Manifest data (canvas.json): CC0 / Public Domain where possible, or fair-use short clips.


