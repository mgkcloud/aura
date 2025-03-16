import { WebSocketServer, WebSocket } from 'ws';
import type { Prisma } from '@prisma/client';
import { authenticate } from './shopify.server';
import http from 'http';

interface AudioStreamMessage {
  type: 'audio';
  data: string; // base64 encoded audio chunks
  participantId: string;
  roomId: string;
  shopId: string;
}

interface CartContextMessage {
  type: 'cart';
  shopId: string;
  items: Array<{
    id: string;
    title: string;
    quantity: number;
    price: string;
  }>;
}

interface ReplicateResponse {
  message: string;
  action: 'search' | 'collection' | 'product' | 'none';
  query?: string;
  handle?: string;
}

type StreamCallback = (response: ReplicateResponse) => void;

// Store active WebSocket connections by participant ID
const activeParticipants = new Map<string, {
  ws: WebSocket;
  shopId: string;
  callbacks: Map<string, StreamCallback>;
  cartContext?: CartContextMessage;
}>();

// Buffer audio chunks until we have enough to send to Replicate
const audioBuffers = new Map<string, Array<string>>();
const BUFFER_SIZE = 2; // Number of chunks before sending to Replicate

// Singleton instance to prevent multiple server initializations
let serverInstance: WebSocketServer | null = null;

export async function initLiveKitProxy() {
  // Return existing server if already initialized
  if (serverInstance) {
    console.log('LiveKit proxy server already running');
    return serverInstance;
  }
  
  // Create HTTP server for both WebSocket and health checks
  const server = http.createServer((req, res) => {
    // Add a health check endpoint
    if (req.url === '/health') {
      console.log('Health check received');
      res.writeHead(200);
      res.end('OK');
      return;
    }
    
    // Handle other routes
    res.writeHead(404);
    res.end('Not found');
  });
  
  // Create WebSocket server
  const wss = new WebSocketServer({ server });
  
  // Handle WebSocket connections
  wss.on('connection', (ws) => {
    let participantId: string | null = null;
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'init') {
          participantId = data.participantId;
          const shopId = data.shopId;
          
          if (!participantId) {
            console.error('Missing participantId in init message');
            return;
          }
          
          // Store the connection
          activeParticipants.set(participantId, {
            ws,
            shopId,
            callbacks: new Map()
          });
          
          // Initialize audio buffer
          audioBuffers.set(participantId, []);
          
          console.log(`New participant connected: ${participantId} from shop: ${shopId}`);
          
          // Send acknowledgement
          ws.send(JSON.stringify({
            type: 'init_ack',
            participantId
          }));
        } 
        else if (data.type === 'audio' && participantId) {
          const audioData = data.data; // base64 encoded audio
          const buffer = audioBuffers.get(participantId) || [];
          
          // Add to buffer
          buffer.push(audioData);
          audioBuffers.set(participantId, buffer);
          
          // If buffer is full, process the audio
          if (buffer.length >= BUFFER_SIZE) {
            processAudioBuffer(participantId, data.requestId);
          }
        }
        else if (data.type === 'cart' && participantId) {
          // Store cart context
          const participant = activeParticipants.get(participantId);
          if (participant) {
            participant.cartContext = data as CartContextMessage;
            activeParticipants.set(participantId, participant);
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    ws.on('close', () => {
      if (participantId) {
        console.log(`Participant disconnected: ${participantId}`);
        audioBuffers.delete(participantId);
        activeParticipants.delete(participantId);
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
  // Start the server
  const PORT = process.env.PORT || 7880;
  server.listen(PORT, () => {
    console.log(`LiveKit proxy server listening on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
    
    // Log environment
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Replicate API Token: ${process.env.REPLICATE_API_TOKEN ? '✓ Set' : '✗ Not set'}`);
    console.log(`Ultravox Model Version: ${process.env.ULTRAVOX_MODEL_VERSION ? '✓ Set' : '✗ Not set'}`);
  });
  
  serverInstance = wss;
  return wss;
}

async function processAudioBuffer(participantId: string, requestId: string) {
  const participant = activeParticipants.get(participantId);
  const buffer = audioBuffers.get(participantId);

  if (!participant || !buffer || buffer.length === 0) return;

  // Combine audio chunks
  const combinedAudio = buffer.join('');
  
  // Clear buffer
  audioBuffers.set(participantId, []);

  // Get cart context
  const cartContext = participant.cartContext;

  try {
    // Call Replicate API
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: process.env.ULTRAVOX_MODEL_VERSION,
        input: {
          command: '', // Empty command since we're using audio
          audio: combinedAudio,
          shop_domain: participant.shopId,
          cart_context: cartContext ? JSON.stringify(cartContext.items) : ''
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Error calling Replicate: ${response.status}`);
    }

    const prediction = await response.json();

    if (prediction.status === 'succeeded') {
      // Handle immediate success
      const result = JSON.parse(prediction.output);
      sendResultToParticipant(participantId, result, requestId);
    } else {
      // For async processing, poll for results
      pollForResult(participantId, prediction.id, requestId);
    }
  } catch (error) {
    console.error('Error processing audio:', error);
    
    // Send error to client
    if (participant && participant.ws.readyState === WebSocket.OPEN) {
      participant.ws.send(JSON.stringify({
        type: 'error',
        requestId,
        error: 'Error processing audio'
      }));
    }
  }
}

async function pollForResult(participantId: string, predictionId: string, requestId: string) {
  const participant = activeParticipants.get(participantId);
  if (!participant) return;

  try {
    let attempts = 0;
    const maxAttempts = 30;

    const checkResult = async () => {
      if (attempts >= maxAttempts) {
        throw new Error('Prediction timed out');
      }

      attempts++;

      const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Error checking prediction status: ${response.status}`);
      }

      const prediction = await response.json();

      if (prediction.status === 'succeeded') {
        const result = JSON.parse(prediction.output);
        sendResultToParticipant(participantId, result, requestId);
        return;
      } else if (prediction.status === 'failed') {
        throw new Error(`Prediction failed: ${prediction.error}`);
      } else {
        // Still processing, wait and check again
        setTimeout(checkResult, 1000);
      }
    };

    checkResult();
  } catch (error) {
    console.error('Error polling for result:', error);
    
    // Send error to client
    if (participant && participant.ws.readyState === WebSocket.OPEN) {
      participant.ws.send(JSON.stringify({
        type: 'error',
        requestId,
        error: 'Error getting prediction result'
      }));
    }
  }
}

function sendResultToParticipant(participantId: string, result: ReplicateResponse, requestId: string) {
  const participant = activeParticipants.get(participantId);
  if (!participant || participant.ws.readyState !== WebSocket.OPEN) return;

  participant.ws.send(JSON.stringify({
    type: 'result',
    requestId,
    result
  }));
}

export async function getShopifyCartData(request: Request) {
  const { admin, session } = await authenticate.admin(request);
  
  try {
    const shop = session.shop;
    const response = await admin.graphql(`
      query GetCartData {
        cart {
          lines(first: 10) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price {
                      amount
                      currencyCode
                    }
                    product {
                      title
                    }
                  }
                }
              }
            }
          }
        }
      }
    `);

    const data = await response.json();
    
    // Format cart data for Ultravox
    const cartItems = data.data.cart.lines.edges.map((edge: any) => ({
      id: edge.node.merchandise.id,
      title: `${edge.node.merchandise.product.title} - ${edge.node.merchandise.title}`,
      quantity: edge.node.quantity,
      price: edge.node.merchandise.price.amount
    }));

    return {
      shopId: shop,
      items: cartItems
    };
  } catch (error) {
    console.error('Error fetching Shopify cart data:', error);
    return {
      shopId: session.shop,
      items: []
    };
  }
}