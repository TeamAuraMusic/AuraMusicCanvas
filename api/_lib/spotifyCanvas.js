// api/_lib/spotifyCanvas.js
// Self-contained Spotify direct canvas fetching using sp_dc + TOTP + protobuf
// Adapted from the Spotify-Canvas-API tool for use inside AuraMusicCanvas Vercel functions

const axios = require('axios');
const OTPAuth = require('otpauth');
require('dotenv').config();

const SP_DC = process.env.SP_DC;
const SECRETS_URL = "https://raw.githubusercontent.com/xyloflake/spot-secrets-go/refs/heads/main/secrets/secretDict.json";

// TOTP state
let currentTotp = null;
let currentTotpVersion = null;
let lastFetchTime = 0;
const FETCH_INTERVAL = 60 * 60 * 1000;

async function fetchSecretsFromGitHub() {
  const response = await axios.get(SECRETS_URL, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  return response.data;
}

function createTotpSecret(data) {
  const mappedData = data.map((value, index) => value ^ ((index % 33) + 9));
  const hexData = Buffer.from(mappedData.join(""), "utf8").toString("hex");
  return OTPAuth.Secret.fromHex(hexData);
}

function useFallbackSecret() {
  const fallbackData = [99, 111, 47, 88, 49, 56, 118, 65, 52, 67, 50, 104, 117, 101, 55, 94, 95, 75, 94, 49, 69, 36, 85, 64, 74, 60];
  const totpSecret = createTotpSecret(fallbackData);
  currentTotp = new OTPAuth.TOTP({ period: 30, digits: 6, algorithm: "SHA1", secret: totpSecret });
  currentTotpVersion = "19";
  console.log('[AuraCanvas] Using fallback TOTP secret');
}

async function updateTOTPSecrets() {
  const now = Date.now();
  if (now - lastFetchTime < FETCH_INTERVAL) return;

  try {
    console.log('[AuraCanvas] Fetching TOTP secrets...');
    const secrets = await fetchSecretsFromGitHub();
    const versions = Object.keys(secrets).map(Number);
    const newestVersion = Math.max(...versions).toString();

    if (newestVersion && newestVersion !== currentTotpVersion) {
      const secretData = secrets[newestVersion];
      const totpSecret = createTotpSecret(secretData);

      currentTotp = new OTPAuth.TOTP({
        period: 30, digits: 6, algorithm: "SHA1", secret: totpSecret
      });
      currentTotpVersion = newestVersion;
      lastFetchTime = now;
      console.log(`[AuraCanvas] TOTP secrets updated to version ${newestVersion}`);
    }
  } catch (error) {
    console.error('[AuraCanvas] Failed to update TOTP secrets:', error.message);
    if (!currentTotp) useFallbackSecret();
  }
}

async function initializeTOTPSecrets() {
  try {
    await updateTOTPSecrets();
  } catch (error) {
    console.error('[AuraCanvas] Failed to initialize TOTP:', error.message);
    if (!currentTotp) useFallbackSecret();
  }
}

// Initialize on module load (important for serverless cold starts)
initializeTOTPSecrets();

async function getServerTime() {
  try {
    const { data } = await axios.get("https://open.spotify.com/api/server-time", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://open.spotify.com/',
        'Referer': 'https://open.spotify.com/',
        'Cookie': `sp_dc=${SP_DC}`,
      },
    });
    return Number(data.serverTime) * 1000;
  } catch {
    return Date.now();
  }
}

function generateTOTP(timestamp) {
  if (!currentTotp) throw new Error("TOTP not initialized");
  return currentTotp.generate({ timestamp });
}

async function getToken() {
  if (!currentTotp) await initializeTOTPSecrets();

  const localTime = Date.now();
  const serverTime = await getServerTime();

  const payload = {
    reason: "init",
    productType: "mobile-web-player",
    totp: generateTOTP(localTime),
    totpVer: currentTotpVersion || "19",
    totpServer: generateTOTP(Math.floor(serverTime / 30))
  };

  const url = new URL("https://open.spotify.com/api/token");
  Object.entries(payload).forEach(([k, v]) => url.searchParams.append(k, v));

  const response = await axios.get(url.toString(), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://open.spotify.com/',
      'Referer': 'https://open.spotify.com/',
      'Cookie': `sp_dc=${SP_DC}`,
    },
  });

  return response.data?.accessToken;
}

// Protobuf canvas fetch (requires the copied _canvas_pb.cjs)
async function getCanvases(trackUri) {
  if (!SP_DC) throw new Error("SP_DC not configured in environment");

  const { CanvasRequest, CanvasResponse } = (await import('./_canvas_pb.cjs')).default;

  const accessToken = await getToken();

  const canvasRequest = new CanvasRequest();
  const track = new CanvasRequest.Track();
  track.setTrackUri(trackUri);
  canvasRequest.addTracks(track);

  const requestBytes = canvasRequest.serializeBinary();

  const response = await axios.post(
    'https://spclient.wg.spotify.com/canvaz-cache/v0/canvases',
    requestBytes,
    {
      responseType: 'arraybuffer',
      headers: {
        'Accept': 'application/protobuf',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Language': 'en',
        'User-Agent': 'Spotify/9.0.34.593 iOS/18.4 (iPhone15,3)',
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (response.status !== 200) {
    return null;
  }

  const parsed = CanvasResponse.deserializeBinary(response.data).toObject();
  return parsed;
}

module.exports = { getCanvases };
