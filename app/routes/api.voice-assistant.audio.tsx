import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import WebSocket from 'ws';

// This endpoint is for receiving audio data from the frontend via AJAX
// Path: /apps/voice/audio in production via app proxy

export const action = async ({ request }: ActionFunctionArgs) => {
  // Use either public session cookie or app proxy authentication
  try {
    await authenticate.public.checkSessionCookie(request);
  } catch (e) {
    // If checkSessionCookie fails, this might be coming through app proxy
    console.log('Session cookie authentication failed, may be app proxy request');
  }
  
  console.log('Audio endpoint request received from:', request.url);
  
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }
  
  try {
    const { audio, shopDomain, requestId } = await request.json();
    
    if (!audio) {
      return json({ error: 'Audio data is required' }, { status: 400 });
    }
    
    if (!shopDomain) {
      return json({ error: 'Shop domain is required' }, { status: 400 });
    }
    
    // Generate a request ID if one wasn't provided
    const finalRequestId = requestId || `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Connect to LiveKit server
    const livekitUrl = process.env.LIVEKIT_URL || "ws://localhost:7880";
    console.log(`Connecting to LiveKit server at ${livekitUrl}`);
    
    return await new Promise((resolve, reject) => {
      const ws = new WebSocket(livekitUrl);
      
      const timeout = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
        resolve(json({ 
          error: 'LiveKit connection timeout',
          status: 'error',
          requestId: finalRequestId
        }, { status: 504 }));
      }, 10000);
      
      ws.on('open', () => {
        console.log(`Connected to LiveKit server, sending data for shop: ${shopDomain}`);
        
        // Generate a unique participant ID for this connection
        const participantId = `relay-${shopDomain}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Initialize with shop domain
        ws.send(JSON.stringify({
          type: 'init',
          participantId,
          shopId: shopDomain
        }));
        
        // Send audio data
        ws.send(JSON.stringify({
          type: 'audio',
          data: audio,
          requestId: finalRequestId
        }));
        
        console.log(`Sent audio data with requestId: ${finalRequestId}`);
      });
      
      // Handle messages from LiveKit
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log(`Received message from LiveKit: ${data.type}`);
          
          if (data.type === 'init_ack') {
            console.log('LiveKit connection initialized successfully');
            // Initialization acknowledged, waiting for results
            // We can return an acknowledgment here since audio processing may take time
            clearTimeout(timeout);
            
            // For streaming audio, it's better to return an acknowledgment 
            // and let the client continue receiving results via SSE
            resolve(json({ 
              status: 'processing',
              message: 'Audio received and processing',
              requestId: finalRequestId
            }));
            
            // Keep the connection open for potential immediate results
          } else if (data.type === 'result' && data.requestId === finalRequestId) {
            console.log('Received immediate result from LiveKit');
            clearTimeout(timeout);
            ws.close();
            
            // If we haven't resolved yet, send the result
            resolve(json({
              ...data.result,
              status: 'succeeded',
              requestId: finalRequestId
            }));
          } else if (data.type === 'error' && data.requestId === finalRequestId) {
            console.error(`Error from LiveKit: ${data.error}`);
            clearTimeout(timeout);
            ws.close();
            
            resolve(json({ 
              error: data.error,
              status: 'error',
              requestId: finalRequestId
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
          status: 'error',
          requestId: finalRequestId
        }, { status: 500 }));
      });
      
      ws.on('close', () => {
        console.log('LiveKit connection closed');
        clearTimeout(timeout);
      });
    });
    
  } catch (error) {
    console.error('Error processing audio:', error);
    return json({ 
      error: 'Internal server error', 
      status: 'error'
    }, { status: 500 });
  }
};