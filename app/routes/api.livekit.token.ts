import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { AccessToken } from "livekit-server-sdk";
// import { authenticate } from "../shopify.server"; // Cannot use standard authenticate here

// Define CORS headers - Adjust origin in production
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Replace with your storefront origin in production
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization", // Include necessary headers
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Handle OPTIONS preflight request for CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Ensure environment variables are set
  const livekitHost = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_KEY;
  const livekitApiSecret = process.env.LIVEKIT_SECRET;

  if (!livekitHost || !livekitApiKey || !livekitApiSecret) {
    console.error("[LiveKit Token] Missing required environment variables (LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET)");
    return json({ error: "LiveKit configuration missing" }, { status: 500, headers: CORS_HEADERS });
  }

  // --- Get Shop Domain --- 
  // This endpoint is called directly from the theme extension, bypassing standard auth.
  // We expect the shop domain to be passed as a query parameter.
  // TODO: Implement a more secure authentication method (e.g., signed requests) in production.
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get("shop");

  if (!shopDomain) {
    console.warn("[LiveKit Token] Missing 'shop' query parameter.");
    return json({ error: "Missing required shop parameter" }, { status: 400, headers: CORS_HEADERS });
  }

  // Basic validation of shop domain format (optional but recommended)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shopDomain)) {
      console.warn(`[LiveKit Token] Invalid shop domain format received: ${shopDomain}`);
      return json({ error: "Invalid shop domain format" }, { status: 400, headers: CORS_HEADERS });
  }

  // --- Generate Participant Identity & Room Name ---
  const roomName = `voice-assistant-${shopDomain}`;
  // Generate a unique ID for the participant.
  // IMPORTANT: Avoid generating a new identity on every token request for the *same* user session.
  // This should ideally be managed client-side (stored in sessionStorage/localStorage) or 
  // passed securely from an initial authenticated context.
  // For simplicity here, we generate a random one - IMPROVE THIS.
  const participantIdentity = `user-${shopDomain}-${Math.random().toString(36).substring(2, 12)}`;

  console.log(`[LiveKit Token] Generating token for Shop: ${shopDomain}, Room: ${roomName}, Participant: ${participantIdentity}`);

  // --- Create LiveKit Access Token --- 
  try {
    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: participantIdentity,
    });

    // Define permissions
    at.addGrant({ 
      room: roomName,
      roomJoin: true,
      canPublish: true,        // Allow publishing audio
      canSubscribe: true,      // Allow subscribing to tracks (e.g., TTS audio)
      canPublishData: true,    // Allow sending data messages (optional)
    });

    // Set token expiration (e.g., 15 minutes)
    at.ttl = '15m';

    // Generate the JWT
    const token = await at.toJwt();

    console.log("[LiveKit Token] Token generated successfully.");

    // Return the LiveKit URL and the generated token
    return json(
      { 
        livekitUrl: livekitHost, 
        token: token 
      },
      { headers: CORS_HEADERS }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[LiveKit Token] Error generating LiveKit token:", error);
    return json({ error: "Failed to generate LiveKit token", details: errorMessage }, { status: 500, headers: CORS_HEADERS });
  }
}; 