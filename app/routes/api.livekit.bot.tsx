/**
 * Bot Join/Leave API
 * 
 * API endpoints to trigger the bot to join or leave a LiveKit room.
 */
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { triggerBotJoin, triggerBotLeave } from "../bot/index";

// Define CORS headers for cross-origin access
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Replace with your storefront origin in production
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Handle OPTIONS preflight request
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
};

/**
 * Handle bot join/leave requests
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  // Handle OPTIONS preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
  }

  try {
    // Parse request body
    const body = await request.json();
    const { action, roomName } = body;

    if (!roomName) {
      return json({ error: "Missing required parameter: roomName" }, { status: 400, headers: CORS_HEADERS });
    }

    switch (action) {
      case 'join':
        console.log(`[API/Bot] Triggering bot to join room: ${roomName}`);
        await triggerBotJoin(roomName);
        return json({ success: true, message: `Bot triggered to join room: ${roomName}` }, { headers: CORS_HEADERS });

      case 'leave':
        console.log(`[API/Bot] Triggering bot to leave room: ${roomName}`);
        await triggerBotLeave(roomName);
        return json({ success: true, message: `Bot triggered to leave room: ${roomName}` }, { headers: CORS_HEADERS });

      default:
        return json({ error: "Invalid action. Use 'join' or 'leave'." }, { status: 400, headers: CORS_HEADERS });
    }
  } catch (error) {
    console.error('[API/Bot] Error processing request:', error);
    return json({ 
      error: "Failed to process bot request", 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500, headers: CORS_HEADERS });
  }
}; 