import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import WebSocket from 'ws';

/**
 * Direct API endpoint for processing voice assistant audio
 * This can be used for testing without going through the app proxy
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.checkSessionCookie(request);
  
  return json({ status: "ok" });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.checkSessionCookie(request);
  
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Parse the JSON body to get audio data
    const { audio, shopDomain } = await request.json();
    
    if (!audio) {
      return json({ error: "Missing audio data" }, { status: 400 });
    }
    
    if (!shopDomain) {
      return json({ error: "Missing shop domain" }, { status: 400 });
    }

    // Process the audio data using LiveKit proxy
    return await new Promise((resolve, reject) => {
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
        // Initialize the connection
        ws.send(JSON.stringify({
          type: 'init',
          participantId: `direct-api-${shopDomain}-${Date.now()}`,
          shopId: shopDomain
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