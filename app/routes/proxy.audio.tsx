import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * App Proxy endpoint for processing voice assistant audio
 * This route handles audio data specifically, as a subpath of the main proxy.
 * This is accessed through the Shopify App Proxy at: /apps/voice/audio
 * 
 * The app_proxy configuration in shopify.app.toml defines the base path:
 * [app_proxy]
 * url = "https://your-app-url.com/proxy"
 * prefix = "apps"
 * subpath = "voice"
 * 
 * This route handles: /apps/voice/audio which maps to /proxy/audio
 * 
 * Note: In Remix with flat routes, proxy.audio.tsx maps to /proxy/audio route
 */

// GET handler for options/health checks
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { liquid, session } = await authenticate.public.appProxy(request);
  
  // Enhanced request logging for debug
  console.log('===== AUDIO PROXY GET REQUEST =====');
  console.log('Request URL:', request.url);
  console.log('Request path:', new URL(request.url).pathname);
  console.log('Session shop:', session?.shop);
  console.log('Headers:', Object.fromEntries([...request.headers.entries()].map(([k, v]) => [k, v])));
  console.log('==============================');
  
  // If this is a preflight OPTIONS request, handle it with proper CORS headers
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  // Check the Accept header to determine if this is an API request
  const acceptHeader = request.headers.get('Accept') || '';
  if (acceptHeader.includes('application/json')) {
    // Return JSON for API requests
    return json({ 
      status: "ok", 
      message: "Voice Assistant Audio API is running"
    }, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept"
      }
    });
  }

  // Return HTML for browser requests
  return liquid(`
    <div style="font-family: system-ui, sans-serif; padding: 2rem;">
      <h1>Voice Assistant Audio API is running</h1>
      <p>This endpoint is configured to handle audio data for the voice assistant.</p>
      <p>Shop: ${session?.shop || 'Not available'}</p>
      <p>Time: ${new Date().toISOString()}</p>
      <p>Path: ${new URL(request.url).pathname}</p>
    </div>
  `, { layout: false });
};

// POST handler for processing audio
export const action = async ({ request }: ActionFunctionArgs) => {
  // Use Shopify's authentication for app proxy
  const { session } = await authenticate.public.appProxy(request);

  // Set CORS headers for all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Content-Type": "application/json"
  };

  // Enhanced request logging for debugging
  console.log('===== AUDIO PROXY REQUEST =====');
  console.log('Request URL:', request.url);
  console.log('Request path:', new URL(request.url).pathname);
  console.log('Session shop:', session?.shop);
  console.log('Headers:', Object.fromEntries([...request.headers.entries()].map(([k, v]) => [k, v])));
  console.log('==============================');
  
  if (request.method !== "POST") {
    console.log('Method not allowed:', request.method);
    return json({ error: "Method not allowed" }, { 
      status: 405,
      headers: corsHeaders
    });
  }

  try {
    // Use the CORS headers we defined earlier
    const responseHeaders = corsHeaders;

    // Parse the JSON body to get audio data
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      console.error('Failed to parse request JSON:', jsonError);
      return json({ 
        error: 'Invalid JSON in request body',
        message: 'The request contained invalid JSON data.'
      }, { 
        status: 400,
        headers: responseHeaders 
      });
    }
    
    const { audio, shopDomain, requestId } = body;
    
    console.log('Audio request received with data:');
    console.log('- Shop domain:', shopDomain);
    console.log('- Request ID:', requestId);
    console.log('- Audio data provided:', !!audio);
    
    // Validate the audio data format
    if (audio && typeof audio === 'string') {
      // Check if it looks like base64 data
      if (!audio.match(/^[A-Za-z0-9+/=]+$/)) {
        console.warn('Audio data does not appear to be valid base64');
      }
    }
    
    // Audio data is required for this endpoint
    if (!audio) {
      return json({ error: "Missing audio data" }, { 
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

    // Process the audio data using LiveKit proxy
    console.log('Processing audio via LiveKit Proxy (HTTP POST)');
    const livekitProxyUrl = process.env.LIVEKIT_PROXY_URL || "http://localhost:7880"; // Use HTTP URL
    const currentRequestId = requestId || `audio-req-${Date.now()}`;

    console.log(`Sending POST request to LiveKit Proxy at: ${livekitProxyUrl}`);
    console.log(`Audio data length: ${audio ? audio.length : 0} characters`);
    
    try {
      const proxyResponse = await fetch(livekitProxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Shopify-Shop-Domain': shop,
          'X-Request-ID': currentRequestId,
          // Add other relevant headers if needed (e.g., X-Session-ID if available)
        },
        body: JSON.stringify({
          audio: audio,
          shopId: shop,
          requestId: currentRequestId
          // Add sessionId if available in body
        }),
        // Add a timeout for the fetch request if desired
        // signal: AbortSignal.timeout(15000) // Example: 15 second timeout
      });

      if (!proxyResponse.ok) {
        const errorText = await proxyResponse.text();
        console.error(`Error response from LiveKit Proxy: ${proxyResponse.status} - ${errorText}`);
        return json({ 
          error: 'Error communicating with voice service',
          message: `Proxy returned status ${proxyResponse.status}` 
        }, { 
          status: 502, 
          headers: responseHeaders 
        });
      }

      console.log(`LiveKit Proxy responded with status: ${proxyResponse.status}`);
      const responseBody = await proxyResponse.json(); 
      
      // Return the acknowledgement from the proxy
      return json({ 
        status: 'processing', 
        message: 'Audio received by proxy, processing...',
        proxyResponse: responseBody 
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
      console.error('Error sending POST request to LiveKit Proxy:', fetchError); 
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
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');
    return json({ 
      error: 'Error processing audio data',
      message: 'Sorry, there was a problem processing your request.'
    }, { 
      status: 500,
      headers: corsHeaders
    });
  }
};