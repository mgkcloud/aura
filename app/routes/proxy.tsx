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
  const { liquid } = await authenticate.public.appProxy(request);
  
  // Return a simple liquid response for health check
  return liquid("Voice Assistant API is running", { layout: false });
};

// POST handler for processing audio
export const action = async ({ request }: ActionFunctionArgs) => {
  // Use Shopify's authentication for app proxy
  const { session } = await authenticate.public.appProxy(request);

  console.log('App proxy request received from:', request.url);
  console.log('Session shop:', session?.shop);
  
  // Log request path and subpath
  const url = new URL(request.url);
  console.log('Request path:', url.pathname);
  
  if (request.method !== "POST") {
    console.log('Method not allowed:', request.method);
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Parse the JSON body to get audio data
    const body = await request.json();
    const { audio, shopDomain, command } = body;
    
    console.log('Request received with data:');
    console.log('- Shop domain:', shopDomain);
    console.log('- Command provided:', !!command);
    console.log('- Audio data provided:', !!audio);
    
    // Support both audio data and text commands
    if (!audio && !command) {
      return json({ error: "Missing audio data or command" }, { status: 400 });
    }
    
    // Use shop from session if shopDomain isn't provided
    const shop = shopDomain || session?.shop;
    if (!shop) {
      console.error('No shop domain provided and no session shop found');
      return json({ error: "Missing shop domain" }, { status: 400 });
    }

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
            resolve(json(JSON.parse(prediction.output)));
          } else if (prediction.status === "failed") {
            throw new Error(`Replicate prediction failed: ${prediction.error}`);
          } else {
            resolve(json({ status: "pending", id: prediction.id }, { status: 202 }));
          }
        }).catch((error) => {
          console.error('Error calling Replicate:', error);
          resolve(json({ 
            error: 'Error processing text command',
            message: 'Sorry, there was a problem processing your request.'
          }, { status: 500 }));
        });
        
        return;
      }
      
      // Otherwise, process audio via LiveKit
      console.log('Processing audio via LiveKit');
      const livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
      const ws = new WebSocket(livekitUrl);
      const requestId = Date.now().toString();
      
      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve(json({ 
          error: 'LiveKit connection timeout',
          message: 'Sorry, processing took too long. Please try again.'
        }, { status: 504 }));
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
          requestId
        }));
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          
          if (data.type === 'init_ack') {
            // Connection initialized, waiting for results
          } else if (data.type === 'result' && data.requestId === requestId) {
            clearTimeout(timeout);
            ws.close();
            resolve(json(data.result));
          } else if (data.type === 'error' && data.requestId === requestId) {
            clearTimeout(timeout);
            ws.close();
            resolve(json({ 
              error: data.error,
              message: 'Sorry, there was an error processing your request.'
            }, { status: 500 }));
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
        }, { status: 500 }));
      });
      
      ws.on('close', () => {
        clearTimeout(timeout);
      });
    });
  } catch (error) {
    console.error('Error processing audio data:', error);
    return json({ 
      error: 'Error processing audio data',
      message: 'Sorry, there was a problem processing your request.'
    }, { status: 500 });
  }
};