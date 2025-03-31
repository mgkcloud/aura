import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * App Proxy endpoint for processing voice assistant audio
 * This is accessed through the Shopify App Proxy at: /apps/voice
 * 
 * The app_proxy configuration in shopify.app.toml is:
 * [app_proxy]
 * url = "https://your-app-url.com/proxy"
 * prefix = "apps"
 * subpath = "voice"
 */

// GET handler for options/health checks
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { liquid, session } = await authenticate.public.appProxy(request);
  
  // Get request details
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Log all request details for debugging
  console.log('===== PROXY REQUEST DETAILS =====');
  console.log('Request URL:', url.toString());
  console.log('Request path:', path);
  console.log('Session shop:', session?.shop);
  console.log('Query parameters:');
  url.searchParams.forEach((value, key) => {
    console.log(`- ${key}: ${value}`);
  });
  console.log('==============================');
  
  // Handle SSE connections via /apps/voice?stream=true
  // If this is a preflight OPTIONS request, handle it with proper CORS headers
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  
  // Enhanced request logging for debug
  console.log('===== VOICE PROXY REQUEST =====');
  console.log('Request URL:', request.url);
  console.log('Request path:', path);
  console.log('Session shop:', session?.shop);
  console.log('==============================');
  
  // Return a simple liquid response for health check
  return liquid("Voice Assistant API is running", { layout: false });
};

// POST handler for processing audio
export const action = async ({ request }: ActionFunctionArgs) => {
  // Use Shopify's authentication for app proxy
  const { session } = await authenticate.public.appProxy(request);

  // Enhanced request logging for debugging
  console.log('===== AUDIO POST REQUEST =====');
  console.log('Request URL:', request.url);
  console.log('Request path:', new URL(request.url).pathname);
  console.log('Session shop:', session?.shop);
  console.log('Headers:', Object.fromEntries([...request.headers.entries()].map(([k, v]) => [k, v])));
  console.log('==============================');
  
  if (request.method !== "POST") {
    console.log('Method not allowed:', request.method);
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Add CORS headers to all responses for browser compatibility
    const responseHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    };

    // Parse the JSON body to get audio data
    const body = await request.json();
    const { audio, shopDomain, command, requestId, sessionId } = body;
    
    console.log('Request received with data:');
    console.log('- Shop domain:', shopDomain);
    console.log('- Command provided:', !!command);
    console.log('- Audio data provided:', !!audio);
    console.log('- Request ID:', requestId);
    console.log('- Session ID:', sessionId);
    
    // Support both audio data and text commands
    if (!audio && !command) {
      return json({ error: "Missing audio data or command" }, { 
        status: 400,
        headers: responseHeaders 
      });
    }
    
    // Use shop from session if shopDomain isn't provided
    const shop = shopDomain || session?.shop;
    if (!shop) {
      console.error('No shop domain provided and no session shop found');
      return json({ error: "Missing shop domain" }, { 
        status: 400,
        headers: responseHeaders 
      });
    }

    // Check if we have a valid session ID from an SSE connection
    if (sessionId) {
      console.log(`Request associated with SSE session: ${sessionId}`);
    }

    // Generate a unique tracking ID for this request if not provided
    const uniqueRequestId = requestId || `req-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    console.log(`Using request ID: ${uniqueRequestId}`);

    // Process the command or audio data using LiveKit proxy
    // Process audio via LiveKit Proxy using HTTP POST
    console.log('Processing audio via LiveKit Proxy (HTTP POST)');
    const livekitProxyUrl = process.env.LIVEKIT_PROXY_URL || "http://localhost:7880"; // Use HTTP URL
    
    console.log(`Sending POST request to LiveKit Proxy at: ${livekitProxyUrl}`);
    
    try {
      const proxyResponse = await fetch(livekitProxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          // Forward relevant headers from the original request
          'X-Shopify-Shop-Domain': shop,
          'X-Request-ID': uniqueRequestId,
          'X-Session-ID': sessionId || '', // Send session ID if available
          // Add any other headers the proxy might need
        },
        body: JSON.stringify({
          audio: audio, // Send the audio data
          command: command, // Send command if present
          shopId: shop, // Send shop domain
          sessionId: sessionId, // Send session ID
          requestId: uniqueRequestId // Send request ID
          // Add cartContext if needed and available
        }),
      });

      if (!proxyResponse.ok) {
        // Handle non-2xx responses from the proxy
        const errorText = await proxyResponse.text();
        console.error(`Error response from LiveKit Proxy: ${proxyResponse.status} - ${errorText}`);
        return json({ 
          error: 'Error communicating with voice service',
          message: `Proxy returned status ${proxyResponse.status}` 
        }, { 
          status: 502, // Bad Gateway might be appropriate
          headers: responseHeaders 
        });
      }

      // Proxy likely returns 202 Accepted or similar if successful
      // The actual result will come via SSE later
      console.log(`LiveKit Proxy responded with status: ${proxyResponse.status}`);
      const responseBody = await proxyResponse.json(); // Assuming proxy sends back JSON ack
      
      return json({ 
        status: 'processing', 
        message: 'Audio received, processing...',
        proxyResponse: responseBody // Include proxy ack if needed
      }, { 
        status: 202, // Accepted
        headers: responseHeaders 
      });

    } catch (fetchError) {
      // Type check for the caught error
      let errorMessage = 'An unknown error occurred while connecting to the voice service.';
      if (fetchError instanceof Error) {
        errorMessage = fetchError.message;
      } else if (typeof fetchError === 'string') {
        errorMessage = fetchError;
      }
      console.error('Error sending POST request to LiveKit Proxy:', fetchError); // Log the original error still
      return json({ 
        error: 'Failed to connect to voice service',
        message: errorMessage 
      }, { 
        status: 503, // Service Unavailable
        headers: responseHeaders 
      });
    }
  } catch (error) {
    console.error('Error processing audio data:', error);
    return json({ 
      error: 'Error processing audio data',
      message: 'Sorry, there was a problem processing your request.'
    }, { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
      }
    });
  }
};