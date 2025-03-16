import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import WebSocket from 'ws';

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
    return await new Promise((resolve, reject) => {
      try {
        console.log('Processing audio via LiveKit');
        // Important: Always use ws:// protocol for WebSockets in development/Docker
        // In production, this should be configured properly with wss:// if behind SSL
        let livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
        
        // Force ws:// protocol if running locally or in Docker (not in production)
        if (livekitUrl.startsWith('wss://') && (
            livekitUrl.includes('localhost') || 
            livekitUrl.includes('127.0.0.1')
        )) {
          livekitUrl = livekitUrl.replace('wss://', 'ws://');
        }
        
        console.log(`Connecting to LiveKit at: ${livekitUrl}`);
        console.log(`Audio data length: ${audio ? audio.length : 0} characters`);
      let ws;
      try {
        ws = new WebSocket(livekitUrl);
      } catch (wsError) {
        console.error('Error creating WebSocket:', wsError);
        return resolve(json({ 
          error: 'LiveKit connection error',
          message: 'Failed to create WebSocket connection to audio processing server.'
        }, { 
          status: 500,
          headers: responseHeaders 
        }));
      }
      
      const currentRequestId = requestId || Date.now().toString();
      
      const timeout = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        
        // If we timed out waiting for LiveKit, provide a direct response
        // This allows bypassing LiveKit for testing
        const fallbackResponse = {
          message: "I'm sorry, but the voice service is taking too long to respond. How can I help you today?",
          action: "none"
        };
        
        console.log('Returning fallback response due to timeout:', fallbackResponse);
        resolve(json(fallbackResponse, { 
          status: 200, // Return as success with fallback content
          headers: responseHeaders 
        }));
      }, 15000);
      
      ws.on('open', () => {
        console.log('LiveKit connection opened');
        // Initialize the connection
        ws.send(JSON.stringify({
          type: 'init',
          participantId: `app-proxy-${shop}-${Date.now()}`,
          shopId: shop
        }));
        
        // Send the audio data
        ws.send(JSON.stringify({
          type: 'audio',
          data: audio,
          requestId: currentRequestId
        }));
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'init_ack') {
            // Connection initialized, waiting for results
          } else if (data.type === 'result' && data.requestId === currentRequestId) {
            clearTimeout(timeout);
            ws.close();
            resolve(json(data.result, { 
              headers: responseHeaders
            }));
          } else if (data.type === 'error' && data.requestId === currentRequestId) {
            clearTimeout(timeout);
            ws.close();
            resolve(json({ 
              error: data.error,
              message: 'Sorry, there was an error processing your request.'
            }, { 
              status: 500,
              headers: responseHeaders 
            }));
          }
        } catch (error) {
          console.error('Error parsing LiveKit message:', error);
        }
      });
      
      ws.on('error', (error) => {
        console.error('LiveKit connection error:', error);
        clearTimeout(timeout);
        resolve(json({ 
          error: 'LiveKit connection error',
          message: 'Sorry, there was a problem connecting to the voice service.'
        }, { 
          status: 500,
          headers: responseHeaders 
        }));
      });
      
      ws.on('close', () => {
        clearTimeout(timeout);
      });
      } catch (unexpectedError) {
        console.error('Unexpected error during WebSocket setup:', unexpectedError);
        resolve(json({ 
          error: 'Unexpected error',
          message: 'An unexpected error occurred while setting up the audio connection.'
        }, { 
          status: 500,
          headers: responseHeaders 
        }));
      }
    });
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