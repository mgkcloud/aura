/**
 * LiveKit Proxy Server for Voice AI Shopping Assistant (ES Module Version)
 * 
 * This server handles both WebSocket and HTTP communications:
 * - WebSocket for legacy audio streaming (backward compatible)
 * - HTTP POST for audio data transmission
 * - Server-Sent Events (SSE) for streaming responses
 * 
 * The server maintains session state and handles audio processing
 * through the Replicate API using the Ultravox model.
 */

import { WebSocketServer } from 'ws';
import http from 'http';
import fetch from 'node-fetch';
import { URL } from 'url';

// Store active WebSocket connections by participant ID
const activeConnections = new Map();

// Track SSE connections by session ID
const sseConnections = new Map();

// Audio buffer for accumulating chunks before processing
const audioBuffers = new Map();
const BUFFER_SIZE = 2; // Number of chunks before sending to Replicate

// Session management
const activeSessions = new Map(); // sessionId -> {participantId, shopId, lastActive}
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// CORS headers for HTTP responses
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400'
};

// Default response when Replicate API is unavailable
const fallbackResponse = {
  message: "I understand you're asking about products. How can I help you find what you're looking for?",
  action: "none"
};

// Singleton instance to prevent multiple server initializations
let serverInstance = null;

// Session cleanup interval
let sessionCleanupInterval = null;

/**
 * Initialize LiveKit proxy server
 * @returns {Promise<object>} The server instance
 */
export async function initLiveKitProxy() {
  // Return existing server if already initialized
  if (serverInstance) {
    console.log('LiveKit proxy server already running');
    return serverInstance;
  }

  // Create HTTP server for WebSocket, SSE, HTTP POST and health checks
  const server = http.createServer(async (req, res) => {
    // Set CORS headers for all responses
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    // Parse URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    
    // Handle OPTIONS preflight requests
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    
    // Health check endpoint
    if (path === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        version: '1.1.0',
        connections: {
          websocket: activeConnections.size,
          sse: sseConnections.size,
          sessions: activeSessions.size
        }
      }));
      return;
    }
    
    // SSE endpoint for streaming responses
    if (req.method === 'GET' && url.searchParams.get('stream') === 'true') {
      handleSSEConnection(req, res, url);
      return;
    }
    
    // Audio POST endpoint
    if (req.method === 'POST' && path === '/') {
      handleAudioPost(req, res);
      return;
    }
    
    // Handle other routes
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  
  // Create WebSocket server (for backward compatibility)
  const wss = new WebSocketServer({ server });
  
  // Handle WebSocket connections (legacy support)
  wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    let participantId = null;
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`Received WebSocket message type: ${data.type}`);
        
        // Handle initialization message
        if (data.type === 'init') {
          participantId = data.participantId;
          const shopId = data.shopId;
          const sessionId = data.sessionId;
          
          console.log(`Initializing participant: ${participantId} from shop: ${shopId}`);
          
          // Store the connection with shop context
          activeConnections.set(participantId, {
            ws,
            shopId,
            sessionId,
            cartContext: data.cartContext || null
          });
          
          // Initialize audio buffer
          if (!audioBuffers.has(participantId)) {
            audioBuffers.set(participantId, []);
          }
          
          // If we have a session ID, link this participant to the session
          if (sessionId && activeSessions.has(sessionId)) {
            const session = activeSessions.get(sessionId);
            session.participantId = participantId;
            session.lastActive = Date.now();
            activeSessions.set(sessionId, session);
            
            console.log(`Linked participant ${participantId} to session ${sessionId}`);
          }
          
          // Send acknowledgement
          ws.send(JSON.stringify({
            type: 'init_ack',
            participantId,
            sessionId
          }));
        } 
        // Handle audio data
        else if (data.type === 'audio' && participantId) {
          console.log(`Received audio data from ${participantId}`);
          const audioData = data.data;
          const requestId = data.requestId || `req-${Date.now()}`;
          const chunkNumber = data.chunkNumber || 0;
          
          // Add to buffer with chunk number for ordering
          const buffer = audioBuffers.get(participantId) || [];
          buffer.push({
            data: audioData,
            chunkNumber
          });
          audioBuffers.set(participantId, buffer);
          
          // Process buffer if we have enough chunks
          if (buffer.length >= BUFFER_SIZE) {
            await processAudioBuffer(participantId, requestId);
          }
        }
        // Handle cart context updates
        else if (data.type === 'cart' && participantId) {
          console.log(`Received cart context from ${participantId}`);
          const connection = activeConnections.get(participantId);
          if (connection) {
            connection.cartContext = data.cartContext;
            activeConnections.set(participantId, connection);
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        
        // Try to send error response back to client
        try {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Error processing message',
            message: error.message
          }));
        } catch (sendError) {
          console.error('Error sending error response:', sendError);
        }
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      if (participantId) {
        console.log(`Participant disconnected: ${participantId}`);
        
        // Get connection info before deleting
        const connection = activeConnections.get(participantId);
        
        // Clean up connection
        activeConnections.delete(participantId);
        
        // Note: Don't delete audio buffer immediately in case we're processing
        // It will be cleaned up in the session cleanup process
        
        // If this connection was associated with a session, update the session
        if (connection && connection.sessionId) {
          const sessionId = connection.sessionId;
          if (activeSessions.has(sessionId)) {
            const session = activeSessions.get(sessionId);
            // Don't remove participantId yet in case it reconnects
            session.lastActive = Date.now();
            session.wsActive = false;
            activeSessions.set(sessionId, session);
          }
        }
      } else {
        console.log('Unknown participant disconnected');
      }
    });
    
    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      
      // Try to send error response back to client
      try {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'WebSocket error',
          message: error.message
        }));
      } catch (sendError) {
        console.error('Error sending error response:', sendError);
      }
    });
  });
  
  // Start session cleanup interval
  if (!sessionCleanupInterval) {
    startSessionCleanup();
  }
  
  // Start HTTP server
  const PORT = process.env.PORT || 7880;
  
  // Log environment details
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Replicate API Token: ${process.env.REPLICATE_API_TOKEN ? '✓ Set' : '✗ Not set'}`);
  console.log(`Ultravox Model Version: ${process.env.ULTRAVOX_MODEL_VERSION || '[NOT SET - THIS WILL CAUSE ERRORS]'}`);
  
  // Wrap server.listen in a Promise for async/await compatibility
  await new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`LiveKit proxy server listening on port ${PORT}`);
      console.log(`Services available:`);
      console.log(`- WebSocket: ws://localhost:${PORT}`);
      console.log(`- SSE Stream: http://localhost:${PORT}?stream=true`);
      console.log(`- Audio POST: http://localhost:${PORT}`);
      console.log(`- Health Check: http://localhost:${PORT}/health`);
      resolve();
    });
  });
  
  // Store both the WebSocket server and HTTP server for proper cleanup
  serverInstance = {
    wss,
    server,
    port: PORT
  };
  
  return serverInstance;
}

/**
 * Handle SSE (Server-Sent Events) connection
 * @param {http.IncomingMessage} req - The request object
 * @param {http.ServerResponse} res - The response object
 * @param {URL} url - The parsed URL object
 */
async function handleSSEConnection(req, res, url) {
  // Extract shop domain from query params
  const shopDomain = url.searchParams.get('shop');
  
  if (!shopDomain) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'shop parameter is required' }));
    return;
  }
  
  console.log(`Setting up SSE connection for shop: ${shopDomain}`);
  
  // Generate a unique session ID
  const sessionId = `sse-${shopDomain}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.log(`Created new SSE session: ${sessionId}`);
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  
  // Initialize session data
  activeSessions.set(sessionId, {
    shopId: shopDomain,
    lastActive: Date.now(),
    sseActive: true,
    participantId: null // Will be set when WebSocket connection is established
  });
  
  // Send initial message with session ID
  sendSSE(res, 'open', { sessionId });
  
  // Set up heartbeat interval
  const heartbeatInterval = setInterval(() => {
    try {
      if (req.socket.destroyed) {
        clearInterval(heartbeatInterval);
        return;
      }
      
      sendSSE(res, 'heartbeat', Date.now());
      
      // Update last active timestamp
      if (activeSessions.has(sessionId)) {
        const session = activeSessions.get(sessionId);
        session.lastActive = Date.now();
        activeSessions.set(sessionId, session);
      }
    } catch (error) {
      console.error('Error sending heartbeat:', error);
      clearInterval(heartbeatInterval);
    }
  }, 30000);
  
  // Store the SSE connection info
  sseConnections.set(sessionId, {
    res,
    heartbeatInterval,
    shopDomain
  });
  
  // Handle connection close
  req.on('close', () => {
    console.log(`SSE connection closed for session: ${sessionId}`);
    
    // Clean up
    clearInterval(heartbeatInterval);
    sseConnections.delete(sessionId);
    
    // Update session state but don't remove it yet (websocket might still be active)
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      session.sseActive = false;
      session.lastActive = Date.now();
      activeSessions.set(sessionId, session);
    }
  });
  
  // Handle aborted connection
  req.on('aborted', () => {
    console.log(`SSE connection aborted for session: ${sessionId}`);
    
    // Clean up
    clearInterval(heartbeatInterval);
    sseConnections.delete(sessionId);
    
    // Update session state
    if (activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      session.sseActive = false;
      session.lastActive = Date.now();
      activeSessions.set(sessionId, session);
    }
  });
}

/**
 * Handle audio data sent via HTTP POST
 * @param {http.IncomingMessage} req - The request object
 * @param {http.ServerResponse} res - The response object
 */
async function handleAudioPost(req, res) {
  try {
    // Read and parse the request body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);
    const body = JSON.parse(bodyBuffer.toString());
    
    // Extract data from the body
    const { audio, shopDomain, requestId, sessionId, chunkNumber = 0 } = body;
    
    console.log(`Received audio POST request:`);
    console.log(`- Shop: ${shopDomain}`);
    console.log(`- RequestID: ${requestId}`);
    console.log(`- SessionID: ${sessionId}`);
    console.log(`- ChunkNumber: ${chunkNumber}`);
    
    // Validate required fields
    if (!audio) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'audio data is required' }));
      return;
    }
    
    if (!shopDomain) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'shopDomain is required' }));
      return;
    }
    
    // Generate a unique request ID if not provided
    const uniqueRequestId = requestId || `req-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    // Process session info
    let participantId;
    
    // If we have a session ID, try to find the participant ID
    if (sessionId && activeSessions.has(sessionId)) {
      const session = activeSessions.get(sessionId);
      session.lastActive = Date.now();
      
      // Use existing participant ID if available, or create a new one
      participantId = session.participantId || `post-${sessionId}-${Date.now()}`;
      
      // Update the session with the participant ID if it was newly created
      if (session.participantId !== participantId) {
        session.participantId = participantId;
        activeSessions.set(sessionId, session);
      }
    } else {
      // No session or invalid session, create a new participant ID
      participantId = `post-${shopDomain}-${Date.now()}`;
    }
    
    console.log(`Using participant ID: ${participantId} for audio processing`);
    
    // Store connection info if not already present
    if (!activeConnections.has(participantId)) {
      activeConnections.set(participantId, {
        shopId: shopDomain,
        sessionId,
        postOnly: true  // Flag this as a POST-only participant
      });
    }
    
    // Initialize audio buffer if needed
    if (!audioBuffers.has(participantId)) {
      audioBuffers.set(participantId, []);
    }
    
    // Add audio data to buffer with chunk info
    const buffer = audioBuffers.get(participantId);
    buffer.push({
      data: audio,
      chunkNumber: parseInt(chunkNumber, 10)
    });
    audioBuffers.set(participantId, buffer);
    
    // Process buffer if we have enough chunks
    if (buffer.length >= BUFFER_SIZE) {
      try {
        // Process asynchronously but don't await
        processAudioBuffer(participantId, uniqueRequestId);
        
        // Return success immediately
        res.writeHead(202);
        res.end(JSON.stringify({ 
          status: 'processing',
          requestId: uniqueRequestId
        }));
      } catch (error) {
        console.error('Error starting audio processing:', error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Error starting audio processing' }));
      }
    } else {
      // Not enough chunks yet, just acknowledge receipt
      res.writeHead(200);
      res.end(JSON.stringify({ 
        status: 'received',
        requestId: uniqueRequestId,
        chunksReceived: buffer.length,
        chunksNeeded: BUFFER_SIZE
      }));
    }
  } catch (error) {
    console.error('Error handling audio POST:', error);
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Invalid request data' }));
  }
}

/**
 * Send an SSE event to the client
 * @param {http.ServerResponse} res - The response object
 * @param {string} event - The event name
 * @param {*} data - The data to send
 */
function sendSSE(res, event, data) {
  try {
    // Skip if response is already sent or connection closed
    if (res.writableEnded || res.writableFinished) {
      return;
    }
    
    const sseData = typeof data === 'object' ? JSON.stringify(data) : data;
    
    // Construct SSE message
    res.write(`event: ${event}\n`);
    res.write(`data: ${sseData}\n\n`);
  } catch (error) {
    console.error(`Error sending SSE event ${event}:`, error);
  }
}

/**
 * Start session cleanup interval
 */
function startSessionCleanup() {
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
  }
  
  sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    
    // Clean up expired sessions
    for (const [sessionId, session] of activeSessions.entries()) {
      // Check if session is expired
      if (now - session.lastActive > SESSION_TIMEOUT) {
        console.log(`Cleaning up expired session: ${sessionId}`);
        
        // Clean up associated resources
        const participantId = session.participantId;
        if (participantId) {
          console.log(`Cleaning up participant: ${participantId}`);
          activeConnections.delete(participantId);
          audioBuffers.delete(participantId);
        }
        
        // Remove SSE connection if it exists
        if (sseConnections.has(sessionId)) {
          const { heartbeatInterval } = sseConnections.get(sessionId);
          clearInterval(heartbeatInterval);
          sseConnections.delete(sessionId);
        }
        
        // Finally remove the session
        activeSessions.delete(sessionId);
      }
    }
  }, 60000); // Run cleanup every minute
  
  console.log('Session cleanup interval started');
}

/**
 * Process audio buffer for a participant
 * @param {string} participantId - The unique ID of the participant
 * @param {string} requestId - The ID of the request
 */
async function processAudioBuffer(participantId, requestId) {
  console.log(`Processing audio buffer for ${participantId}, request ID: ${requestId}`);
  
  const connection = activeConnections.get(participantId);
  if (!connection) {
    console.error(`No connection found for participant: ${participantId}`);
    return;
  }
  
  // Get buffer and create a copy before clearing
  const bufferItems = [...(audioBuffers.get(participantId) || [])];
  
  // Clear the buffer to allow for immediate next audio processing
  audioBuffers.set(participantId, []);
  
  // If buffer is empty, return early
  if (bufferItems.length === 0) {
    console.warn(`Empty buffer for participant ${participantId}`);
    return;
  }
  
  try {
    let result;
    
    // Sort buffer items by chunk number if available
    bufferItems.sort((a, b) => {
      // If both items have chunkNumber, sort by it
      if (a.chunkNumber !== undefined && b.chunkNumber !== undefined) {
        return a.chunkNumber - b.chunkNumber;
      }
      
      // If only one has chunkNumber, prioritize the one with it
      if (a.chunkNumber !== undefined) return -1;
      if (b.chunkNumber !== undefined) return 1;
      
      // If neither has chunkNumber, keep original order
      return 0;
    });
    
    console.log(`Sorted ${bufferItems.length} audio chunks by sequence number`);
    
    // Extract audio data from buffer items
    const audioData = bufferItems.map(item => {
      // Handle both objects with data property and direct strings
      return typeof item === 'object' && item.data ? item.data : item;
    });
    
    // Combine audio chunks
    const combinedAudio = audioData.join('');
    
    // Send processing status to participant
    sendResultToParticipant(participantId, {
      type: 'status',
      status: 'processing',
      message: "I'm processing your request...",
    }, requestId);
    
    // Only attempt Replicate API call if credentials are available
    if (process.env.REPLICATE_API_TOKEN && process.env.ULTRAVOX_MODEL_VERSION) {
      console.log(`Starting Replicate API request with shop: ${connection.shopId}`);
      
      // Validate the audio data
      if (!combinedAudio || combinedAudio.length < 100) {
        console.warn(`Audio data appears to be too small (${combinedAudio.length} chars), may be invalid`);
      }
      
      // Verify it looks like base64 data
      if (!combinedAudio.match(/^[A-Za-z0-9+/=]+$/)) {
        console.warn('Audio data does not appear to be valid base64');
      } else {
        console.log('Audio data appears to be valid base64 format');
      }
      
      // Prepare request payload with shop context
      const payload = {
        version: process.env.ULTRAVOX_MODEL_VERSION,
        input: {
          command: '',  // Empty command, using audio only
          audio: combinedAudio,
          shop_domain: connection.shopId,
          cart_context: connection.cartContext ? 
            (typeof connection.cartContext === 'string' ? 
              connection.cartContext : 
              JSON.stringify(connection.cartContext)) : 
            ''
        }
      };
      
      console.log(`Sending prediction to Replicate for shop ${connection.shopId}`);
      console.log(`Using model version: ${process.env.ULTRAVOX_MODEL_VERSION}`);
      console.log(`Audio data length: ${combinedAudio.length} characters`);
      
      try {
        // Call Replicate API
        const response = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Replicate API error (${response.status}): ${errorText}`);
          console.error(`Request payload: ${JSON.stringify(payload, null, 2)}`);
          throw new Error(`Replicate API error (${response.status}): ${errorText}`);
        }
        
        const prediction = await response.json();
        console.log(`Replicate API response: ${JSON.stringify(prediction, null, 2)}`);
        
        if (prediction.status === 'succeeded') {
          // Handle immediate success (rare with audio processing)
          console.log(`Prediction succeeded immediately: ${prediction.id}`);
          console.log(`Output: ${prediction.output}`);
          result = JSON.parse(prediction.output);
          console.log(`Parsed result: ${JSON.stringify(result, null, 2)}`);
        } else if (prediction.status === 'processing' || prediction.status === 'starting') {
          // For async processing (normal case), poll for result
          console.log(`Prediction processing, ID: ${prediction.id}`);
          console.log(`URL to check: https://api.replicate.com/v1/predictions/${prediction.id}`);
          
          // Send initial "processing" message to client
          sendResultToParticipant(participantId, {
            message: "I'm processing your request, please wait a moment...",
            action: "none",
            status: "processing"
          }, requestId);
          
          // Poll for complete result
          result = await pollPredictionResult(prediction.id, participantId, requestId);
          
          // If polling returned null (timeout or error), use fallback response
          if (!result) {
            result = {
              message: "Sorry, it's taking longer than expected to process your request. Please try again or ask a simpler question.",
              action: "none"
            };
          }
        } else {
          // Failed or other status
          console.warn(`Unexpected prediction status: ${prediction.status}`);
          result = fallbackResponse;
        }
      } catch (apiError) {
        console.error('Replicate API error:', apiError);
        console.error(`Request payload that caused error: ${JSON.stringify(payload, null, 2)}`);
        
        // Try a simpler test call to check if the API is working at all
        try {
          console.log('Attempting simple test API call to Replicate...');
          const testResponse = await fetch('https://api.replicate.com/v1/models', {
            headers: {
              Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`
            }
          });
          
          if (testResponse.ok) {
            console.log('Simple test API call succeeded - API token is valid');
          } else {
            console.error(`Simple test API call failed: ${testResponse.status}`);
          }
        } catch (testError) {
          console.error('Test API call failed completely:', testError);
        }
        
        result = {
          message: "Sorry, I encountered a problem understanding your request. Could you try again?",
          action: "none"
        };
      }
    } else {
      // Use fallback response if no API token (development mode)
      console.log('Using fallback response (no Replicate credentials)');
      if (!process.env.REPLICATE_API_TOKEN) {
        console.warn('REPLICATE_API_TOKEN is not set in environment');
      }
      if (!process.env.ULTRAVOX_MODEL_VERSION) {
        console.warn('ULTRAVOX_MODEL_VERSION is not set in environment');
      }
      result = fallbackResponse;
    }
    
    // Send final result to participant
    sendResultToParticipant(participantId, result, requestId);
  } catch (error) {
    console.error('Error processing audio:', error);
    
    // Send error response
    sendErrorToParticipant(participantId, 'Error processing audio', requestId);
  }
}

/**
 * Poll for prediction result from Replicate
 * @param {string} predictionId - The ID of the prediction to poll
 * @param {string} participantId - The ID of the participant
 * @param {string} requestId - The ID of the request
 * @returns {Promise<object|null>} The prediction result or null if failed
 */
async function pollPredictionResult(predictionId, participantId, requestId) {
  const MAX_ATTEMPTS = 30;
  const POLL_INTERVAL = 1000; // 1 second
  
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`
        }
      });
      
      if (!response.ok) {
        console.error(`Error checking prediction status: ${response.status}`);
        // Continue polling despite error
        continue;
      }
      
      const predictionStatus = await response.json();
      console.log(`Poll attempt ${attempt + 1} for prediction ${predictionId}: Status = ${predictionStatus.status}`);
      
      if (predictionStatus.status === 'succeeded') {
        console.log(`Prediction ${predictionId} succeeded after ${attempt + 1} attempts`);
        console.log(`Output: ${JSON.stringify(predictionStatus.output, null, 2)}`);
        
        try {
          if (typeof predictionStatus.output === 'string') {
            return JSON.parse(predictionStatus.output);
          } else {
            return predictionStatus.output;
          }
        } catch (parseError) {
          console.error(`Error parsing prediction output: ${parseError}`);
          console.error(`Raw output: ${predictionStatus.output}`);
          // Return a formatted response even if parsing fails
          return {
            message: String(predictionStatus.output || "Sorry, I couldn't understand the audio clearly."),
            action: "none"
          };
        }
      } else if (predictionStatus.status === 'failed') {
        console.error(`Prediction ${predictionId} failed: ${predictionStatus.error}`);
        console.error(`Full prediction status: ${JSON.stringify(predictionStatus, null, 2)}`);
        return null;
      }
      
      // If connection is closed, stop polling
      const connection = activeConnections.get(participantId);
      if (!connection || connection.ws.readyState !== 1) {
        console.log(`Connection closed for ${participantId}, stopping poll for ${predictionId}`);
        return null;
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    } catch (error) {
      console.error(`Error polling prediction ${predictionId}:`, error);
    }
  }
  
  console.warn(`Polling for prediction ${predictionId} timed out after ${MAX_ATTEMPTS} attempts`);
  return null;
}

/**
 * Send result back to the participant
 * @param {string} participantId - The ID of the participant
 * @param {object} result - The result to send
 * @param {string} requestId - The ID of the request
 */
function sendResultToParticipant(participantId, result, requestId) {
  const connection = activeConnections.get(participantId);
  if (!connection) {
    console.error(`Cannot send result: No connection for participant ${participantId}`);
    return;
  }
  
  try {
    connection.ws.send(JSON.stringify({
      type: 'result',
      result,
      requestId
    }));
    console.log(`Sent result to ${participantId} for request ${requestId}`);
  } catch (error) {
    console.error('Error sending result:', error);
  }
}

// Default export for compatibility
export default {
  initLiveKitProxy
};