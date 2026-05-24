// api/canvas/album.js
// On-demand album canvas lookup for AuraMusicCanvas backend

const { getCanvases } = require('../_lib/spotifyCanvas');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { album, artist, tracks } = req.body || {};

  if (!album || !artist || !Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'album, artist and tracks[] are required' });
  }

  for (const trackId of tracks) {
    try {
      const canvasData = await getCanvases(`spotify:track:${trackId}`);
      
      if (canvasData && canvasData.canvasesList && canvasData.canvasesList.length > 0) {
        const canvas = canvasData.canvasesList[0];
        return res.json({
          success: true,
          album,
          artist,
          trackId,
          canvasUrl: canvas.canvasUrl,
          source: 'spotify_direct'
        });
      }
    } catch (err) {
      console.error(`[AuraCanvas] Failed for track ${trackId}:`, err.message);
    }
  }

  return res.status(404).json({ success: false, message: 'No canvas found for album' });
};
