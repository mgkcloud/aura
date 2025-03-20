import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import WebSocket from 'ws';

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
  if (url.searchParams.get('stream') === 'true') {
    console.log('Detected SSE request, establishing event stream');
    return handleSSE(request, session?.shop);
  }
  
  // Legacy WebSocket connections via /apps/voice?ws=true (for backward compatibility)
  if (url.searchParams.get('ws') === 'true') {
    console.log('Detected legacy WebSocket request, handling via SSE');
    return handleSSE(request, session?.shop);
  }
  
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

// Handle Server-Sent Events (SSE) for streaming responses
async function handleSSE(request: Request, shopDomain?: string) {
  // Get shop from query params or session
  const url = new URL(request.url);
  shopDomain = url.searchParams.get('shop') || shopDomain;
  
  // Log all query parameters for debugging
  console.log('SSE request query parameters:');
  url.searchParams.forEach((value, key) => {
    console.log(`- ${key}: ${value}`);
  });
  
  if (!shopDomain) {
    return new Response('Shop domain is required', { status: 400 });
  }
  
  console.log(`Setting up SSE connection for shop: ${shopDomain}`);
  
  // URL for the LiveKit proxy server
  const livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
  
  // Generate a unique session ID for tracking this SSE connection
  const sessionId = `sse-${shopDomain}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  console.log(`Created new SSE session: ${sessionId}`);
  
  // Create SSE response
  const responseStream = new ReadableStream({
    start(controller) {
      // Initial connection message
      controller.enqueue(`event: open\ndata: ${JSON.stringify({ sessionId })}\n\n`);
      
      // Heartbeat to keep connection alive (every 30 seconds)
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(`event: heartbeat\ndata: ${Date.now()}\n\n`);
        } catch (e) {
          clearInterval(heartbeatInterval);
        }
      }, 30000);
      
      // Track the WebSocket connection
      let livekitWs: WebSocket | null = null;
      let isConnected = false;
      let reconnectAttempt = 0;
      const maxReconnectAttempts = 3;
      
      // Function to create a new LiveKit connection
      const createLiveKitConnection = () => {
        // Clean up old connection if exists
        if (livekitWs) {
          try {
            livekitWs.removeAllListeners();
            if (livekitWs.readyState === WebSocket.OPEN) {
              livekitWs.close();
            }
          } catch (e) {
            console.warn('Error cleaning up old WebSocket:', e);
          }
        }
        
        // Create new connection
        livekitWs = new WebSocket(livekitUrl);
        
        // Set up event handlers
        livekitWs.on('open', () => {
          console.log('Relay connected to LiveKit server');
          isConnected = true;
          
          // Connect to LiveKit
          initializeLiveKitConnection();
          
          // Send connection established message to frontend
          controller.enqueue(`event: message\ndata: ${JSON.stringify({ type: 'connected' })}\n\n`);
        });
        
        livekitWs.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            
            // Special handling for init_ack to reset reconnect attempts
            if (data.type === 'init_ack') {
              reconnectAttempt = 0; // Successfully connected, reset counter
              console.log('LiveKit connection initialized successfully');
              controller.enqueue(`event: ready\ndata: ${JSON.stringify({ sessionId })}\n\n`);
            } else if (data.type === 'result') {
              // Send result with proper event type
              controller.enqueue(`event: result\ndata: ${JSON.stringify(data.result)}\n\n`);
            } else {
              // Forward all other messages to the client
              controller.enqueue(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
            }
          } catch (error) {
            console.error('Error parsing LiveKit message:', error);
            controller.enqueue(`event: error\ndata: ${JSON.stringify({ 
              message: 'Error parsing server message'
            })}\n\n`);
          }
        });
        
        livekitWs.on('close', () => {
          console.log('Relay disconnected from LiveKit server');
          isConnected = false;
          controller.enqueue(`event: message\ndata: ${JSON.stringify({ type: 'disconnected' })}\n\n`);
          
          // Try to reconnect if this wasn't an intentional close
          if (reconnectAttempt <= maxReconnectAttempts) {
            reconnectAttempt++;
            setTimeout(() => {
              console.log(`Attempting to reconnect to LiveKit server (attempt ${reconnectAttempt}/${maxReconnectAttempts})`);
              controller.enqueue(`event: message\ndata: ${JSON.stringify({ 
                type: 'reconnecting', 
                attempt: reconnectAttempt 
              })}\n\n`);
              createLiveKitConnection();
            }, 2000 * reconnectAttempt); // Exponential backoff
          } else {
            controller.enqueue(`event: close\ndata: ${JSON.stringify({ 
              reason: 'Max reconnection attempts reached'
            })}\n\n`);
            controller.close();
            clearInterval(heartbeatInterval);
          }
        });
        
        livekitWs.on('error', (error) => {
          console.error('LiveKit connection error:', error);
          controller.enqueue(`event: error\ndata: ${JSON.stringify({ 
            message: 'Connection error' 
          })}\n\n`);
        });
      };
      
      // Function to initialize LiveKit connection
      const initializeLiveKitConnection = () => {
        try {
          if (!livekitWs || livekitWs.readyState !== WebSocket.OPEN) {
            console.error('Cannot initialize LiveKit connection: WebSocket not open');
            return;
          }
          
          // Generate a unique participant ID for this connection
          const participantId = `shop-${shopDomain}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          
          // Send init message to LiveKit
          livekitWs.send(JSON.stringify({
            type: 'init',
            participantId,
            shopId: shopDomain,
            sessionId
          }));
        } catch (error) {
          console.error('Error during LiveKit initialization:', error);
        }
      };
      
      // Create initial connection
      createLiveKitConnection();
      
      // Setup cleanup when client disconnects
      request.signal.addEventListener('abort', () => {
        console.log(`Client disconnected, closing LiveKit connection for session: ${sessionId}`);
        clearInterval(heartbeatInterval);
        
        if (livekitWs && livekitWs.readyState === WebSocket.OPEN) {
          livekitWs.close();
        }
        
        controller.close();
      });
    }
  });
  
  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable proxy buffering for Nginx
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

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
    return await new Promise((resolve, reject) => {
      // If we have a text command without audio, we can call Replicate directly
      if (command && !audio) {
        console.log('Processing text command directly:', command);
        
        // Call Replicate API directly for text commands
        fetch("https://api.replicate.com/v1/predictions", {
          method: "POST",
          headers: {
            Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            version: process.env.ULTRAVOX_MODEL_VERSION,
            input: {
              command,
              audio: '',
              shop_domain: shop,
              cart_context: ''
            }
          }),
        }).then(async (response) => {
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Replicate API error: ${response.status} - ${JSON.stringify(errorData)}`);
          }
          
          return response.json();
        }).then((prediction) => {
          if (prediction.status === "succeeded") {
            resolve(json(JSON.parse(prediction.output), { headers: responseHeaders }));
          } else if (prediction.status === "failed") {
            throw new Error(`Replicate prediction failed: ${prediction.error}`);
          } else {
            resolve(json({ status: "pending", id: prediction.id }, { 
              status: 202,
              headers: responseHeaders 
            }));
          }
        }).catch((error) => {
          console.error('Error calling Replicate:', error);
          resolve(json({ 
            error: 'Error processing text command',
            message: 'Sorry, there was a problem processing your request.'
          }, { 
            status: 500,
            headers: responseHeaders
          }));
        });
        
        return;
      }
      
      // Process audio via LiveKit
      console.log('Processing audio via LiveKit');
      let livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
      
      // Force ws:// protocol if running locally or in Docker (not in production)
      if (livekitUrl.startsWith('wss://') && (
          livekitUrl.includes('localhost') || 
          livekitUrl.includes('127.0.0.1')
      )) {
        livekitUrl = livekitUrl.replace('wss://', 'ws://');
      }
      
      console.log(`Connecting to LiveKit at: ${livekitUrl}`);
      const ws = new WebSocket(livekitUrl);
      
      // Set a timeout for the LiveKit connection
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.error('Failed to connect to LiveKit server');
          ws.close();
          resolve(json({ 
            error: 'Failed to connect to LiveKit server',
            message: 'Sorry, we couldn\'t connect to the voice service. Please try again later.'
          }, { 
            status: 503, 
            headers: responseHeaders 
          }));
        }
      }, 5000);
      
      // Set a timeout for the overall request
      const requestTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve(json({ 
          error: 'Request timeout',
          message: 'Sorry, processing took too long. Please try again.'
        }, { 
          status: 504,
          headers: responseHeaders 
        }));
      }, 15000);
      
      ws.on('open', () => {
        console.log('LiveKit connection opened');
        clearTimeout(connectionTimeout);
        
        // Generate a unique participant ID for this connection
        const participantId = `app-proxy-${shop}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Initialize the connection
        ws.send(JSON.stringify({
          type: 'init',
          participantId,
          shopId: shop,
          sessionId // Forward the session ID if we have one
        }));
        
        // Send the audio data with the request ID
        ws.send(JSON.stringify({
          type: 'audio',
          data: audio,
          requestId: uniqueRequestId
        }));
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'init_ack') {
            // Connection initialized, waiting for results
            console.log('LiveKit connection initialized successfully');
          } else if (data.type === 'result' && data.requestId === uniqueRequestId) {
            // Got the result, clean up and return
            console.log('Received result from LiveKit for request:', uniqueRequestId);
            clearTimeout(requestTimeout);
            ws.close();
            resolve(json(data.result, { headers: responseHeaders }));
          } else if (data.type === 'error' && data.requestId === uniqueRequestId) {
            // Error processing the request
            console.error('Error from LiveKit:', data.error);
            clearTimeout(requestTimeout);
            ws.close();
            resolve(json({ 
              error: data.error || 'Unknown error',
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
        clearTimeout(connectionTimeout);
        clearTimeout(requestTimeout);
        resolve(json({ 
          error: 'LiveKit connection error',
          message: 'Sorry, there was a problem connecting to the voice service.'
        }, { 
          status: 500,
          headers: responseHeaders 
        }));
      });
      
      ws.on('close', () => {
        clearTimeout(connectionTimeout);
        clearTimeout(requestTimeout);
      });
    });
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