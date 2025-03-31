import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * New dedicated voice proxy that forwards requests to the LiveKit proxy server
 * This route handles both SSE connections and audio POST requests
 * 
 * All requests to /apps/voice will go through here and be forwarded to the LiveKit proxy
 * running on port 7880
 */

// The URL of the LiveKit proxy server
const LIVEKIT_PROXY_URL = process.env.LIVEKIT_PROXY_URL || "http://localhost:7880";

// GET handler for SSE connections and health checks
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Authenticate the app proxy request
    const { session } = await authenticate.public.appProxy(request);
    
    // Extract URL details
    const url = new URL(request.url);
    const isSSE = url.searchParams.get('stream') === 'true';
    
    console.log('===== VOICE PROXY REQUEST =====');
    console.log('Request URL:', request.url);
    console.log('Request path:', url.pathname);
    console.log('Session shop:', session?.shop);
    console.log('Is SSE request:', isSSE);
    console.log('Query parameters:', Object.fromEntries(url.searchParams.entries()));
    console.log('==============================');
    
    // If this is an SSE connection request, forward it to the LiveKit proxy
    if (isSSE) {
      console.log('Forwarding SSE request to LiveKit proxy');
      
      // Forward the request to the LiveKit proxy
      const livekitResponse = await fetch(`${LIVEKIT_PROXY_URL}?${url.searchParams.toString()}`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'X-Shopify-Shop-Domain': session?.shop || url.searchParams.get('shop') || '',
          // Forward all non-forbidden headers
          ...Object.fromEntries(
            [...request.headers.entries()].filter(([key]) => 
              !['host', 'connection', 'content-length'].includes(key.toLowerCase())
            )
          )
        }
      });
      
      // Check if the response is valid
      if (!livekitResponse.ok) {
        console.error('LiveKit proxy returned an error:', livekitResponse.status, livekitResponse.statusText);
        return new Response(
          JSON.stringify({ 
            error: 'LiveKit proxy error',
            status: livekitResponse.status,
            message: 'The voice service is currently unavailable. Please try again later.'
          }), 
          { 
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Accept'
            }
          }
        );
      }
      
      // Create a new ReadableStream that forwards all events from the LiveKit proxy
      const { readable, writable } = new TransformStream();
      
      // Pipe the LiveKit response body to our transform stream
      livekitResponse.body?.pipeTo(writable).catch(error => {
        console.error('Error piping LiveKit response:', error);
      });
      
      // Return the response with SSE headers
      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept'
        }
      });
    }
    
    // Handle OPTIONS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With, X-Session-ID, X-Request-ID, X-Chunk-Number',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    
    // Basic health check endpoint
    if (url.pathname.endsWith('/health')) {
      console.log('Forwarding health check to LiveKit proxy');
      
      try {
        const healthResponse = await fetch(`${LIVEKIT_PROXY_URL}/health`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-Shopify-Shop-Domain': session?.shop || ''
          }
        });
        
        if (!healthResponse.ok) {
          console.error('LiveKit proxy health check failed:', healthResponse.status, healthResponse.statusText);
          return json({ 
            status: 'error',
            message: 'LiveKit proxy health check failed',
            error: `${healthResponse.status}: ${healthResponse.statusText}`
          }, { status: healthResponse.status });
        }
        
        const healthData = await healthResponse.json();
        return json({ 
          status: 'ok',
          livekit_status: healthData.status,
          message: 'Voice Assistant API is running',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error checking LiveKit proxy health:', error);
        return json({ 
          status: 'error',
          message: 'Failed to connect to LiveKit proxy',
          error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 502 });
      }
    }
    
    // Default response for other GET requests
    return json({ 
      status: 'ok', 
      message: 'Voice Assistant API is running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in voice proxy loader:', error);
    return json({ 
      status: 'error',
      message: 'An error occurred processing the voice request',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};

// POST handler for audio data
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // Authenticate the app proxy request
    const { session } = await authenticate.public.appProxy(request);
    
    // Extract URL details
    const url = new URL(request.url);
    
    console.log('===== VOICE PROXY POST REQUEST =====');
    console.log('Request URL:', request.url);
    console.log('Request path:', url.pathname);
    console.log('Session shop:', session?.shop);
    console.log('==============================');
    
    // Clone the request body so we can forward it
    const requestBodyText = await request.text();
    
    // Check if this is a valid JSON request
    let parsedBody;
    try {
      parsedBody = JSON.parse(requestBodyText);
      console.log('Request body parsed:', {
        hasAudio: !!parsedBody.audio,
        shopDomain: parsedBody.shopDomain,
        requestId: parsedBody.requestId,
        sessionId: parsedBody.sessionId,
        chunkNumber: parsedBody.chunkNumber
      });
    } catch (error) {
      console.error('Failed to parse request body as JSON:', error);
      return json({ 
        error: 'Invalid JSON in request body',
        message: 'The request body must be valid JSON'
      }, { status: 400 });
    }
    
    // Add the shop domain from the session if not provided in the request
    if (!parsedBody.shopDomain && session?.shop) {
      parsedBody.shopDomain = session.shop;
      console.log('Added shop domain from session:', session.shop);
    }
    
    // Forward the request to the LiveKit proxy
    console.log(`Forwarding POST request to LiveKit proxy: ${LIVEKIT_PROXY_URL}`);
    const livekitResponse = await fetch(LIVEKIT_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Shop-Domain': session?.shop || parsedBody.shopDomain || '',
        'X-Session-ID': parsedBody.sessionId || '',
        'X-Request-ID': parsedBody.requestId || '',
        'X-Chunk-Number': parsedBody.chunkNumber ? parsedBody.chunkNumber.toString() : '0',
        // Forward all other relevant headers
        ...Object.fromEntries(
          [...request.headers.entries()].filter(([key]) => 
            !['host', 'connection', 'content-length'].includes(key.toLowerCase())
          )
        )
      },
      body: JSON.stringify(parsedBody)
    });
    
    // Return the response from the LiveKit proxy
    const responseData = await livekitResponse.json();
    return json(responseData, { 
      status: livekitResponse.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, X-Requested-With, X-Session-ID, X-Request-ID, X-Chunk-Number'
      }
    });
  } catch (error) {
    console.error('Error in voice proxy action:', error);
    return json({ 
      error: 'Error processing voice request',
      message: 'An error occurred while processing your request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept'
      }
    });
  }
}; 