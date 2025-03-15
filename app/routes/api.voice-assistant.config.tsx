import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.checkSessionCookie(request);
  
  // Get the app URL - this is where our app is hosted
  const appHost = process.env.SHOPIFY_APP_URL || 'http://localhost:3000';
  
  // Return configuration
  return json({
    // Instead of connecting directly to LiveKit, connect to our relay
    eventsEndpoint: "/api/voice-assistant/ws",
    audioEndpoint: "/api/voice-assistant/audio",
    apiEndpoint: "/api/voice-assistant",
    shop: session.shop
  }, {
    headers: {
      // Allow the theme extension to access this config
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
};