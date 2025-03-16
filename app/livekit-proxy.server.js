/**
 * LiveKit Proxy Server for Voice AI Shopping Assistant (ES Module Version)
 * 
 * This server handles WebSocket connections for audio streaming
 * between the browser and the Replicate API using Ultravox model.
 */

import { WebSocketServer } from 'ws';
import http from 'http';
import fetch from 'node-fetch';

// Store active WebSocket connections by participant ID
const activeConnections = new Map();

// Audio buffer for accumulating chunks before processing
const audioBuffers = new Map();
const BUFFER_SIZE = 2; // Number of chunks before sending to Replicate

// Default response when Replicate API is unavailable
const fallbackResponse = {
  message: "I understand you're asking about products. How can I help you find what you're looking for?",
  action: "none"
};

// Singleton instance to prevent multiple server initializations
let serverInstance = null;

/**
 * Initialize LiveKit proxy server
 * @returns {Promise<WebSocketServer>} The WebSocket server instance
 */
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
    console.log('New WebSocket connection established');
    let participantId = null;
    
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`Received message type: ${data.type}`);
        
        // Handle initialization message
        if (data.type === 'init') {
          participantId = data.participantId;
          const shopId = data.shopId;
          
          console.log(`Initializing participant: ${participantId} from shop: ${shopId}`);
          
          // Store the connection with shop context
          activeConnections.set(participantId, {
            ws,
            shopId,
            cartContext: data.cartContext || null
          });
          
          // Initialize audio buffer
          audioBuffers.set(participantId, []);
          
          // Send acknowledgement
          ws.send(JSON.stringify({
            type: 'init_ack',
            participantId
          }));
        } 
        // Handle audio data
        else if (data.type === 'audio' && participantId) {
          console.log(`Received audio data from ${participantId}`);
          const audioData = data.data;
          const requestId = data.requestId || `req-${Date.now()}`;
          
          // Add to buffer
          const buffer = audioBuffers.get(participantId) || [];
          buffer.push(audioData);
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
            connection.cartContext = data;
            activeConnections.set(participantId, connection);
          }
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      if (participantId) {
        console.log(`Participant disconnected: ${participantId}`);
        activeConnections.delete(participantId);
        audioBuffers.delete(participantId);
      } else {
        console.log('Unknown participant disconnected');
      }
    });
    
    // Handle WebSocket errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
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
      console.log(`Health check available at http://localhost:${PORT}/health`);
      resolve();
    });
  });
  
  serverInstance = wss;
  return wss;
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
  const buffer = [...(audioBuffers.get(participantId) || [])];
  
  // Clear the buffer to allow for immediate next audio processing
  audioBuffers.set(participantId, []);
  
  // If buffer is empty, return early
  if (buffer.length === 0) {
    console.warn(`Empty buffer for participant ${participantId}`);
    return;
  }
  
  try {
    let result;
    
    // Only attempt Replicate API call if credentials are available
    if (process.env.REPLICATE_API_TOKEN && process.env.ULTRAVOX_MODEL_VERSION) {
      console.log(`Starting Replicate API request with shop: ${connection.shopId}`);
      // Combine audio chunks
      const combinedAudio = buffer.join('');
      
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
      
      // Use a test command for easier debugging
      const testCommand = "What products do you have?";
      
      // Prepare request payload with shop context
      const payload = {
        version: process.env.ULTRAVOX_MODEL_VERSION,
        input: {
          command: testCommand, // Add a test command to help with debugging
          audio: combinedAudio,
          shop_domain: connection.shopId,
          cart_context: connection.cartContext ? JSON.stringify(connection.cartContext.items) : ''
        }
      };
      
      console.log(`Sending prediction to Replicate for shop ${connection.shopId}`);
      console.log(`Using model version: ${process.env.ULTRAVOX_MODEL_VERSION}`);
      console.log(`Audio data length: ${combinedAudio.length} characters`);
      console.log(`Test command: ${testCommand}`);
      
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
            action: "none"
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
    if (connection?.ws.readyState === 1) { // 1 = WebSocket.OPEN
      connection.ws.send(JSON.stringify({
        type: 'error',
        error: 'Error processing audio',
        requestId
      }));
    }
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