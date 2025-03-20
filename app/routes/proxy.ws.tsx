import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import WebSocket from 'ws';

/**
 * App Proxy WebSocket relay endpoint for voice assistant
 * This is accessed through the Shopify App Proxy at: /apps/voice/ws
 * 
 * Instead of direct WebSockets (which aren't supported by Shopify App Proxy),
 * we use Server-Sent Events (SSE) to create a unidirectional stream from
 * server to client. The client sends messages via separate API calls.
 * 
 * The app_proxy configuration in shopify.app.toml defines the base path:
 * [app_proxy]
 * url = "https://your-app-url.com/proxy"
 * prefix = "apps"
 * subpath = "voice"
 * 
 * This route handles: /apps/voice/ws which maps to /proxy/ws
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Use Shopify's authentication for app proxy
  const { session } = await authenticate.public.appProxy(request);
  
  // Log connection attempt
  console.log('WebSocket proxy connection attempt from:', request.url);
  
  // Get shop from query params or session
  const url = new URL(request.url);
  const shopDomain = url.searchParams.get('shop') || session?.shop;
  
  if (!shopDomain) {
    return new Response('Shop domain is required', { status: 400 });
  }
  
  console.log(`Setting up SSE connection for shop: ${shopDomain}`);
  
  // URL for the LiveKit proxy server
  const livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
  
  // Create SSE response
  const responseStream = new ReadableStream({
    start(controller) {
      // Initial ping to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(`: heartbeat\n\n`);
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
          controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
        });
        
        livekitWs.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            
            // Special handling for init_ack to reset reconnect attempts
            if (data.type === 'init_ack') {
              reconnectAttempt = 0; // Successfully connected, reset counter
              console.log('LiveKit connection initialized successfully');
            }
            
            // Forward all messages to the client
            controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
          } catch (error) {
            console.error('Error parsing LiveKit message:', error);
          }
        });
        
        livekitWs.on('close', () => {
          console.log('Relay disconnected from LiveKit server');
          isConnected = false;
          controller.enqueue(`data: ${JSON.stringify({ type: 'disconnected' })}\n\n`);
          
          // Try to reconnect if this wasn't an intentional close
          if (reconnectAttempt <= maxReconnectAttempts) {
            reconnectAttempt++;
            setTimeout(() => {
              console.log(`Attempting to reconnect to LiveKit server (attempt ${reconnectAttempt}/${maxReconnectAttempts})`);
              controller.enqueue(`data: ${JSON.stringify({ 
                type: 'reconnecting', 
                attempt: reconnectAttempt 
              })}\n\n`);
              createLiveKitConnection();
            }, 2000); // Wait 2 seconds before reconnecting
          } else {
            controller.close();
            clearInterval(heartbeatInterval);
          }
        });
        
        livekitWs.on('error', (error) => {
          console.error('LiveKit connection error:', error);
          controller.enqueue(`data: ${JSON.stringify({ 
            type: 'error', 
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
            shopId: shopDomain
          }));
        } catch (error) {
          console.error('Error during LiveKit initialization:', error);
        }
      };
      
      // Create initial connection
      createLiveKitConnection();
      
      // Setup cleanup when client disconnects
      request.signal.addEventListener('abort', () => {
        console.log('Client disconnected, closing LiveKit connection');
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
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}; 