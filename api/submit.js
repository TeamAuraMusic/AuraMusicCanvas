// Vercel Serverless Function: POST /api/submit
// Simple canvas submission endpoint (optional)
//
// Security notes:
// - This is intentionally open for now (community contributions).
// - In production you should add rate limiting, captcha, or manual review.
// - Submitted entries are NOT automatically merged. They go to a review queue.

const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { song, artist, url, trackId, duration, submittedBy } = req.body || {};

    if (!song || !artist || !url) {
      return res.status(400).json({
        error: 'Missing required fields: song, artist, url'
      });
    }

    // Basic URL validation
    if (!url.startsWith('http')) {
      return res.status(400).json({ error: 'url must be a valid http(s) link' });
    }

    const submission = {
      song: song.trim(),
      artist: artist.trim(),
      url: url.trim(),
      trackId: trackId ? trackId.trim() : undefined,
      duration: duration ? parseInt(duration, 10) : undefined,
      submittedBy: submittedBy ? submittedBy.trim() : 'anonymous',
      submittedAt: new Date().toISOString(),
    };

    // For now we just log it (Vercel logs) and return success.
    // Later you can:
    // - Write to a database (Supabase, PlanetScale, etc.)
    // - Create a GitHub issue automatically
    // - Send to Discord webhook
    console.log('New canvas submission:', submission);

    // Example: you could append to a review queue file
    // const queuePath = path.join(process.cwd(), 'submissions.json');
    // ... append logic ...

    return res.status(200).json({
      success: true,
      message: 'Thank you! Submission received and will be reviewed.',
      submission,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
