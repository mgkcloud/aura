/**
 * LiveKit Proxy Server for Voice AI Shopping Assistant (ES Module Version)
 * 
 * This server handles both WebSocket and HTTP communications:
 * - WebSocket for legacy audio streaming (backward compatible) - CURRENTLY DISABLED FOR DEBUGGING
 * - HTTP POST for audio data transmission
 * - Server-Sent Events (SSE) for streaming responses
 * 
 * The server maintains session state and handles audio processing
 * through the Replicate API using the Ultravox model.
 * 
 * CHANGELOG:
 * - v1.2.2: Optimized health check logging to reduce noise in production logs
 *   - Health check requests now log at DEBUG level instead of INFO level
 *   - "Not a Shopify Proxy Request" message no longer appears for health checks
 *   - Added substantive health checks with proper status codes (503 for failures)
 *   - Health check failures now properly log at ERROR level with details
 *   - Added configuration validation to health checks
 */

import http from 'http';
import fetch from 'node-fetch';
import { URL } from 'url';

// --- Constants ---
const BUFFER_SIZE = 2; // Number of chunks before sending to Replicate
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const REPLICATE_POLL_INTERVAL = 1000; // 1 second
const REPLICATE_MAX_POLL_ATTEMPTS = 30;
const SSE_HEARTBEAT_INTERVAL = 15000; // 15 seconds
const SSE_INITIAL_EVENT_DELAY = 10; // Small delay (ms) before sending first SSE event

// --- State Maps ---
const sseConnections = new Map();    // sessionId -> { res, heartbeatInterval, shopDomain, createdAt, path, userAgent }
const audioBuffers = new Map();      // participantId -> [{ data, chunkNumber, timestamp }]
const activeSessions = new Map();    // sessionId -> { shopId, lastActive, sseActive, participantId?, userAgent?, clientIP?, url?, origin?, proxyValidated?, shopifyHeaders?, closedAt?, closeReason?, error? }

// --- CORS Headers ---
// Allow specific headers needed for client-side logging/correlation
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // Allow any origin for testing (Consider restricting in production)
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, X-Requested-With, X-Request-ID, X-Session-ID, X-Chunk-Number', // Added custom headers
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400'
};

// --- Fallback Response ---
const fallbackResponse = {
  message: "I understand you're asking about products. How can I help you find what you're looking for?",
  action: "none"
};

// --- Singleton Instance ---
let serverInstance = null;
let sessionCleanupInterval = null;

// --- Logging Helper ---
const logPrefix = '[LiveKitProxy]';
function logInfo(...args) {
  console.log(`${logPrefix} INFO:`, ...args);
}
function logWarn(...args) {
  console.warn(`${logPrefix} WARN:`, ...args);
}
function logError(...args) {
  console.error(`${logPrefix} ERROR:`, ...args);
}
function logDebug(...args) {
  // Only log debug messages if not in production or explicitly enabled
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_PROXY === 'true') {
    console.debug(`${logPrefix} DEBUG:`, ...args);
  }
}

// Add new function to determine if a request is a health check
function isHealthCheckRequest(path) {
  return path === '/health' || path.endsWith('/health');
}

/**
 * Initialize LiveKit proxy server
 * @returns {Promise<object>} The server instance
 */
export async function initLiveKitProxy() {
  // Return existing server if already initialized
  if (serverInstance) {
    logInfo('LiveKit proxy server already running');
    return serverInstance;
  }

  logInfo('Initializing LiveKit proxy server...');

  // Create HTTP server for WebSocket, SSE, HTTP POST and health checks
  const server = http.createServer(async (req, res) => {
    const reqId = `http-${Date.now()}-${Math.random().toString(16).substring(2, 8)}`;
    
    // Parse URL with path normalization to handle proxy routes
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Extract path, normalize by stripping off Shopify app proxy prefixes
    const fullPath = url.pathname;
    let normalizedPath = fullPath;
    
    // --- Path Normalization ---
    // Enhanced path normalization with multiple patterns and detailed logging
    if (fullPath.startsWith('/apps/voice')) {
      // Standard format: /apps/voice
      normalizedPath = fullPath.replace(/^\/apps\/voice/, '');
      normalizedPath = normalizedPath || '/';
      logDebug(`[${reqId}] Standard proxy path detected. Normalized: ${normalizedPath}`);
    } else if (fullPath.includes('/proxy/apps/voice')) {
      // Alternative: /proxy/apps/voice (sometimes seen in redirects)
      normalizedPath = fullPath.replace(/.*\/proxy\/apps\/voice/, '');
      normalizedPath = normalizedPath || '/';
      logDebug(`[${reqId}] Alternative proxy path detected. Normalized: ${normalizedPath}`);
    } else {
      // Legacy fallback - original implementation
      const pathParts = fullPath.split('/').filter(Boolean);
      if (pathParts.length > 0 && pathParts[0] === 'apps' && pathParts[1] === 'voice') {
        // We're dealing with a proxied path via Shopify, adjust accordingly
        normalizedPath = '/' + pathParts.slice(2).join('/');
        logDebug(`[${reqId}] Legacy proxy path detection: ${fullPath} -> ${normalizedPath}`);
      } else {
        logDebug(`[${reqId}] No known proxy prefix detected. Using path as-is: ${normalizedPath}`);
      }
    }
    
    // Use appropriate log level based on request type - health checks use DEBUG, others use INFO
    const isHealthCheck = isHealthCheckRequest(normalizedPath);
    if (isHealthCheck) {
      logDebug(`[${reqId}] Incoming health check request: ${req.method} ${req.url}`);
    } else {
      logInfo(`[${reqId}] Incoming request: ${req.method} ${req.url}`);
    }
    
    // Set CORS headers for all responses
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    // --- Shopify Proxy Header Logging ---
    const shopifyShopHeader = req.headers['x-shopify-shop-domain'];
    // Log Shopify proxy details if present
    if (shopifyShopHeader) {
      logInfo(`[${reqId}] Shopify Proxy Request Detected for shop: ${shopifyShopHeader}`);
    } else if (!isHealthCheck) {
      // Only log missing headers for non-health check requests
      logInfo(`[${reqId}] Not a Shopify Proxy Request (missing x-shopify-shop-domain header)`);
    }
    
    // --- OPTIONS Preflight ---
    if (req.method === 'OPTIONS') {
      logInfo(`[${reqId}] Responding to OPTIONS preflight request`);
      res.writeHead(204);
      res.end();
      return;
    }
    
    // --- Health Check ---
    if (isHealthCheck) {
      logDebug(`[${reqId}] Processing health check request`);
      
      // Perform internal health checks
      let healthStatus = {
        status: 'ok',
        version: '1.2.2',
        originalPath: fullPath,
        normalizedPath: normalizedPath,
        connections: { sse: sseConnections.size, sessions: activeSessions.size },
        checks: {
          replicateApiKeyConfigured: !!process.env.REPLICATE_API_TOKEN,
          ultravoxModelVersionConfigured: !!process.env.ULTRAVOX_MODEL_VERSION,
          server: true
        },
        timestamp: Date.now()
      };
      
      // Check for critical configuration issues
      let healthCheckFailed = false;
      const criticalErrors = [];
      
      // Check Replicate API key if we're not in test/development mode without mocks
      if (!process.env.REPLICATE_API_TOKEN && process.env.NODE_ENV === 'production') {
        healthStatus.checks.replicateApiKeyConfigured = false;
        healthCheckFailed = true;
        criticalErrors.push("Replicate API key not configured");
      }
      
      // Check Ultravox model version
      if (!process.env.ULTRAVOX_MODEL_VERSION) {
        healthStatus.checks.ultravoxModelVersionConfigured = false;
        healthCheckFailed = true;
        criticalErrors.push("Ultravox model version not configured");
      }
      
      // Set overall status
      if (healthCheckFailed) {
        healthStatus.status = 'error';
        healthStatus.errors = criticalErrors;
        
        // Log errors at ERROR level
        logError(`[${reqId}] Health check failed with ${criticalErrors.length} errors: ${criticalErrors.join(', ')}`);
        
        // For failing health checks, return 503 Service Unavailable
        res.writeHead(503, { 'Content-Type': 'application/json' });
      } else {
        // Log success at DEBUG level only
        logDebug(`[${reqId}] Health check successful, responding with 200 OK`);
        
        // For successful health checks, return 200 OK
        res.writeHead(200, { 'Content-Type': 'application/json' });
      }
      
      // Send response with health status
      res.end(JSON.stringify(healthStatus));
      return;
    }
    
    // --- SSE Endpoint ---
    // Check if stream parameter is present regardless of path
    if (req.method === 'GET' && url.searchParams.get('stream') === 'true') {
      logInfo(`[${reqId}] Routing to SSE connection handler for path: ${fullPath}`);
      handleSSEConnection(req, res, url, reqId);
      return;
    }
    
    // --- Audio POST Endpoint ---
    // Allow POST requests to the root (after normalization) or the direct /apps/voice path
    if (req.method === 'POST' && (normalizedPath === '/' || fullPath === '/apps/voice')) {
      logInfo(`[${reqId}] Routing to Audio POST handler for path: ${fullPath}`);
      handleAudioPost(req, res, reqId);
      return;
    }
    
    // --- Not Found ---
    logWarn(`[${reqId}] No route matched for ${req.method} ${fullPath} (Normalized: ${normalizedPath}). Responding 404.`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      error: 'Not found',
      originalPath: fullPath,
      normalizedPath: normalizedPath,
      method: req.method
    }));
  });
  
  // --- Start Session Cleanup ---
  if (!sessionCleanupInterval) {
    startSessionCleanup();
  }
  
  // --- Start HTTP Server ---
  const PORT = process.env.PORT || 7880;
  logInfo(`Attempting to start server on port ${PORT}...`);
  // Log environment details
  logInfo(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logInfo(`Replicate API Token: ${process.env.REPLICATE_API_TOKEN ? '✓ Set' : '✗ Not set'}`);
  logInfo(`Ultravox Model Version: ${process.env.ULTRAVOX_MODEL_VERSION || '[NOT SET - THIS WILL CAUSE ERRORS]'}`);
  
  // Wrap server.listen in a Promise for async/await compatibility
  await new Promise((resolve, reject) => {
    server.on('error', (error) => {
      logError(`Server failed to start:`, error);
      reject(error);
    });
    server.listen(PORT, () => {
      logInfo(`LiveKit proxy server listening on port ${PORT}`);
      logInfo(`Services available:`);
      // logInfo(`- WebSocket (Legacy): ws://localhost:${PORT}`); // Disabled
      logInfo(`- SSE Stream: http://localhost:${PORT}?stream=true&shop=<your-shop.myshopify.com>`);
      logInfo(`- Audio POST: http://localhost:${PORT}`);
      logInfo(`- Health Check: http://localhost:${PORT}/health`);
      resolve();
    });
  });
  
  // Store the HTTP server for proper cleanup
  serverInstance = {
    server,
    port: PORT
  };
  
  logInfo('Server initialization complete.');
  return serverInstance;
}

/**
 * Enhanced SSE connection handling with Shopify proxy validation
 * @param {http.IncomingMessage} req - The request object
 * @param {http.ServerResponse} res - The response object
 * @param {URL} url - The parsed URL object
 * @param {string} reqId - The unique ID for this HTTP request
 */
function handleSSEConnection(req, res, url, reqId) {
  logInfo(`[${reqId}] Handling SSE connection request...`);
  logDebug(`[${reqId}] SSE Query Parameters:`, Object.fromEntries(url.searchParams.entries()));
  
  // Check for Shopify proxy headers
  const shopifyShopHeader = req.headers['x-shopify-shop-domain'];
  const shopifyHmacHeader = req.headers['x-shopify-hmac-sha256'];
  const shopDomainFromQuery = url.searchParams.get('shop');
  const providedSessionId = url.searchParams.get('sessionId'); // Check if client is trying to resume

  // Extract shop domain from headers or query params (headers take precedence)
  const shopDomain = shopifyShopHeader || shopDomainFromQuery;
  
  if (!shopDomain) {
    logError(`[${reqId}] SSE connection failed: No shop domain found in headers or query params.`);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'shop parameter is required' }));
    return;
  }
  
  logInfo(`[${reqId}] Processing SSE connection for shop: ${shopDomain}`);
  
  // --- Proxy Validation ---
  let proxyValidated = false;
  if (shopifyShopHeader && shopifyHmacHeader) {
    logInfo(`[${reqId}] SSE request appears to be a Shopify proxy request.`);
    logDebug(`[${reqId}] Shop from header: ${shopifyShopHeader}`);
    logDebug(`[${reqId}] HMAC signature: ${shopifyHmacHeader.substring(0, 10)}...`);
    // TODO: Implement actual HMAC validation here using app secret
    // For now, just log and accept
    proxyValidated = true; 
  } else {
    logInfo(`[${reqId}] SSE request is NOT a Shopify proxy request (missing headers).`);
  }
  
  // --- Session Handling ---
  let sessionId;
  let session;
  if (providedSessionId && activeSessions.has(providedSessionId)) {
      // Attempt to resume existing session
      sessionId = providedSessionId;
      session = activeSessions.get(sessionId);
      session.lastActive = Date.now();
      session.sseActive = true; // Mark SSE as active again
      logInfo(`[${reqId}] Resuming existing SSE session: ${sessionId}`);
  } else {
      // Create a new session
      sessionId = `sse-${shopDomain}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      logInfo(`[${reqId}] Creating new SSE session: ${sessionId}`);
      session = {
        shopId: shopDomain,
        lastActive: Date.now(),
        sseActive: true,
        wsActive: false, // WS might connect later
        participantId: null, // Will be set when WebSocket/POST links to this session
        userAgent: req.headers['user-agent'],
        clientIP: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        url: url.toString(),
        origin: req.headers.origin || 'unknown',
        proxyValidated: proxyValidated,
        shopifyHeaders: shopifyShopHeader ? { shop: shopifyShopHeader, hmacPresent: !!shopifyHmacHeader } : null,
        createdAt: Date.now()
      };
      activeSessions.set(sessionId, session);
  }
  logDebug(`[${reqId}] Session data for ${sessionId}:`, session);

  try {
    // --- SSE Headers ---
    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Prevent nginx buffering
      'Transfer-Encoding': 'identity', // Ensure correct streaming
    };
    const origin = req.headers.origin || '*'; // Be more specific in production
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'; // Ensure GET is allowed
    headers['Access-Control-Allow-Headers'] = CORS_HEADERS['Access-Control-Allow-Headers']; // Use defined headers
    
    // Add diagnostic headers
    headers['X-Session-ID'] = sessionId;
    headers['X-Shopify-Validated'] = proxyValidated ? 'true' : 'false';
    
    res.writeHead(200, headers);
    logInfo(`[${reqId}] Sent SSE headers for session ${sessionId}`);
    
    // --- Initial Events ---
    // Force immediate flush to send headers right away *before* sending first event
    res.flushHeaders();
    logDebug(`[${reqId}] Flushed SSE headers for session ${sessionId}`);

    // Introduce a small delay before sending the first event
    setTimeout(() => {
      const openEventData = { 
        sessionId: sessionId, // Explicitly assign sessionId
        timestamp: Date.now(),
        message: 'SSE connection established'
      };
      // Log the exact data being prepared BEFORE sending
      logInfo(`[${reqId}/${sessionId}] Preparing to send 'open' event with data:`, JSON.stringify(openEventData));
      if (!sessionId) {
        logError(`[${reqId}/${sessionId}] CRITICAL: sessionId is null or undefined just before sending 'open' event!`);
      }
      // Send initial message with session ID and confirmation
      sendSSE(res, 'open', openEventData, { reqId, sessionId });
      
      // Send a ready event shortly after the open event
      setTimeout(() => {
        sendSSE(res, 'ready', {
          status: 'ready',
          timestamp: Date.now()
        }, { reqId, sessionId });
      }, 100); // Send 'ready' 100ms after 'open'

    }, SSE_INITIAL_EVENT_DELAY); // Wait a tiny bit before sending 'open'
    
    // --- Heartbeat ---
    // Set up heartbeat with shorter intervals for production reliability
    const heartbeatInterval = setInterval(() => {
      // Check if socket is still alive before sending heartbeat
      if (req.socket.destroyed) {
        logWarn(`[${reqId}] Socket destroyed for session ${sessionId}, clearing heartbeat.`);
        clearInterval(heartbeatInterval);
        return;
      }
      try {
        // Send heartbeat with timestamp
        sendSSE(res, 'heartbeat', {
          timestamp: Date.now(),
          sessionId
        }, { reqId, sessionId });
        
        // Update last active timestamp in the session map
        if (activeSessions.has(sessionId)) {
          activeSessions.get(sessionId).lastActive = Date.now();
        }
      } catch (hbError) {
        logError(`[${reqId}] Error sending heartbeat for session ${sessionId}:`, hbError);
        clearInterval(heartbeatInterval);
        // Clean up connection state as heartbeat failed
        cleanupSSEConnection(sessionId, 'heartbeat_error', null, hbError.message); // Pass null for interval as it's already cleared
      }
    }, SSE_HEARTBEAT_INTERVAL); 
    logInfo(`[${reqId}] Started heartbeat interval (${SSE_HEARTBEAT_INTERVAL}ms) for session ${sessionId}`);
    
    // --- Store Connection ---
    // Store the SSE connection info with more metadata
    sseConnections.set(sessionId, {
      res,
      heartbeatInterval,
      shopDomain,
      createdAt: Date.now(),
      path: url.pathname,
      userAgent: req.headers['user-agent']
    });
    logInfo(`[${reqId}] SSE connection stored for session ${sessionId}. Total SSE connections: ${sseConnections.size}`);
    
    // --- Event Listeners for Cleanup ---
    // Handle connection close with better logging
    req.on('close', () => {
      logInfo(`[${reqId}] SSE connection closed by client for session: ${sessionId}`);
      cleanupSSEConnection(sessionId, 'client_closed', heartbeatInterval);
    });
    // Handle aborted connection with diagnostic information
    req.on('aborted', () => {
      logWarn(`[${reqId}] SSE connection aborted for session: ${sessionId}`);
      cleanupSSEConnection(sessionId, 'aborted', heartbeatInterval);
    });
    // Handle errors on the socket
    req.socket.on('error', (error) => {
      logError(`[${reqId}] Socket error for SSE session ${sessionId}:`, error);
      cleanupSSEConnection(sessionId, 'socket_error', heartbeatInterval, error.message);
    });
    
  } catch (setupError) {
    logError(`[${reqId}] Error setting up SSE connection for session ${sessionId}:`, setupError);
    // Try to send error response if headers not sent yet
    try {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal server error setting up SSE connection',
          message: setupError.message
        }));
      } else {
         res.end(); // Try to close the connection if headers were sent
      }
    } catch (responseError) {
      logError(`[${reqId}] Error sending error response during SSE setup:`, responseError);
    }
    // Clean up session if created and it wasn't a resume attempt
    if (activeSessions.has(sessionId) && !providedSessionId) { 
        activeSessions.delete(sessionId);
    }
  }
}

/**
 * Cleans up resources associated with an SSE connection.
 * @param {string} sessionId - The session ID to clean up.
 * @param {string} reason - The reason for cleanup.
 * @param {NodeJS.Timeout} [heartbeatInterval] - The interval timer to clear (if not already cleared).
 * @param {string} [errorMessage] - Optional error message.
 */
function cleanupSSEConnection(sessionId, reason, heartbeatInterval, errorMessage) {
    logInfo(`Cleaning up SSE connection for session ${sessionId}. Reason: ${reason}`);
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    // Ensure interval is cleared even if not passed explicitly
    const sseInfo = sseConnections.get(sessionId);
    if (sseInfo?.heartbeatInterval) {
        clearInterval(sseInfo.heartbeatInterval);
    }

    sseConnections.delete(sessionId);
    if (activeSessions.has(sessionId)) {
        const session = activeSessions.get(sessionId);
        session.sseActive = false;
        session.lastActive = Date.now();
        session.closedAt = Date.now();
        session.closeReason = reason;
        if (errorMessage) {
            session.error = errorMessage;
        }
        activeSessions.set(sessionId, session);
        logInfo(`Updated session ${sessionId} status after SSE cleanup. Total SSE connections: ${sseConnections.size}`);
    } else {
        logWarn(`Session ${sessionId} not found during SSE cleanup.`);
    }
}


/**
 * Enhanced audio data handler via HTTP POST with improved diagnostics
 * @param {http.IncomingMessage} req - The request object
 * @param {http.ServerResponse} res - The response object
 * @param {string} reqId - The unique ID for this HTTP request
 */
async function handleAudioPost(req, res, reqId) {
  logInfo(`[${reqId}] Handling Audio POST request...`);
  logDebug(`[${reqId}] POST Request Headers:`, JSON.stringify(req.headers, null, 2));

  try {
    // --- Read Body ---
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);
    logDebug(`[${reqId}] Received POST body size: ${bodyBuffer.length} bytes`);
    
    // --- Parse Body ---
    let body;
    try {
      body = JSON.parse(bodyBuffer.toString());
    } catch (parseError) {
      logError(`[${reqId}] Error parsing POST request body as JSON:`, parseError);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON in request body', message: parseError.message }));
      return;
    }
    
    // --- Extract Data & Validate ---
    const { audio, shopDomain, requestId: clientRequestId, sessionId: clientSessionId, chunkNumber = 0 } = body;
    const shopifyShopHeader = req.headers['x-shopify-shop-domain'];
    const shopifyHmacHeader = req.headers['x-shopify-hmac-sha256'];
    // Prioritize headers for critical info like shop domain and session ID if available
    const effectiveShopDomain = shopifyShopHeader || shopDomain;
    const effectiveSessionId = req.headers['x-session-id'] || clientSessionId; 
    const effectiveRequestId = req.headers['x-request-id'] || clientRequestId || reqId; // Use client/header ID or fallback to internal reqId
    const effectiveChunkNumber = parseInt(req.headers['x-chunk-number'] || chunkNumber, 10) || 0; // Prioritize header

    logInfo(`[${reqId}] Received audio POST details:`);
    logDebug(`  - Shop (Body): ${shopDomain}`);
    logDebug(`  - Shop (Header): ${shopifyShopHeader || 'N/A'}`);
    logInfo(`  - Effective Shop: ${effectiveShopDomain}`);
    logInfo(`  - RequestID (Effective): ${effectiveRequestId}`);
    logInfo(`  - SessionID (Effective): ${effectiveSessionId || 'N/A'}`);
    logInfo(`  - ChunkNumber (Effective): ${effectiveChunkNumber}`);
    logDebug(`  - Audio Data Length: ${audio ? audio.length : 0} chars`);
    
    if (!audio) {
      logError(`[${reqId}] POST failed: Missing required field 'audio'.`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'audio data is required' }));
      return;
    }
    if (!effectiveShopDomain) {
      logError(`[${reqId}] POST failed: Missing required field 'shopDomain' (in body or headers).`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'shopDomain is required' }));
      return;
    }
    
    // --- Proxy Validation ---
    let proxyValidated = false;
    if (shopifyShopHeader && shopifyHmacHeader) {
      logInfo(`[${reqId}] POST request appears to be a Shopify proxy request.`);
      // TODO: Implement HMAC validation
      proxyValidated = true;
    } else {
       logInfo(`[${reqId}] POST request is NOT a Shopify proxy request (missing headers).`);
    }
    
    // --- Session Correlation ---
    let participantId;
    let session = null;
    let sessionFound = false;
    
    if (effectiveSessionId && activeSessions.has(effectiveSessionId)) {
      // Found session by ID provided in request (header or body)
      session = activeSessions.get(effectiveSessionId);
      session.lastActive = Date.now();
      sessionFound = true;
      participantId = session.participantId || `post-${effectiveSessionId}-${Date.now()}`;
      if (!session.participantId) {
          session.participantId = participantId; // Assign if missing
          logInfo(`[${reqId}] Assigned new participant ID ${participantId} to existing session ${effectiveSessionId}`);
      }
      activeSessions.set(effectiveSessionId, session); // Update lastActive
      logInfo(`[${reqId}] Correlated POST to existing session: ${effectiveSessionId} (Participant: ${participantId})`);
    } else {
      // Fallback: Create participant ID without session if no session found/provided
      participantId = `post-${effectiveShopDomain}-${Date.now()}`;
      logWarn(`[${reqId}] No active session found or provided for ID '${effectiveSessionId}'. Created standalone participant: ${participantId}`);
    }
    logDebug(`[${reqId}] Using Participant ID: ${participantId}`);
    
    // --- Store/Update Connection Info ---
    // Use participantId as the key for activeConnections
    if (!activeConnections.has(participantId)) {
      logInfo(`[${reqId}] Creating new connection entry for participant: ${participantId}`);
      activeConnections.set(participantId, {
        shopId: effectiveShopDomain,
        sessionId: effectiveSessionId, // Store the session ID this POST is associated with
        postOnly: true, // Mark that this participant entry might only represent POSTs
        proxyValidated,
        createdAt: Date.now(),
        lastActive: Date.now(),
        requestId: effectiveRequestId, // Store the request ID from the POST
        origin: req.headers.origin || 'unknown',
        userAgent: req.headers['user-agent']
      });
    } else {
      // Update existing connection (e.g., if WS connected first or subsequent POST)
      const existing = activeConnections.get(participantId);
      existing.lastActive = Date.now();
      existing.requestId = effectiveRequestId; // Update with latest request ID
      if (effectiveSessionId && !existing.sessionId) {
          existing.sessionId = effectiveSessionId; // Link session ID if missing
          logInfo(`[${reqId}] Linked session ${effectiveSessionId} to existing participant ${participantId} via POST.`);
      }
      activeConnections.set(participantId, existing);
      logDebug(`[${reqId}] Updated existing connection entry for participant: ${participantId}`);
    }
    
    // --- Audio Buffering ---
    // Use participantId as the key for audio buffers
    if (!audioBuffers.has(participantId)) {
      audioBuffers.set(participantId, []);
    }
    const buffer = audioBuffers.get(participantId);
    buffer.push({
      data: audio,
      chunkNumber: effectiveChunkNumber,
      timestamp: Date.now()
    });
    // No need to set back buffer, it's modified in place
    logInfo(`[${reqId}] Added audio chunk ${effectiveChunkNumber} to buffer for ${participantId}. Buffer size: ${buffer.length}`);
    
    // --- Process Buffer or Acknowledge ---
    if (buffer.length >= BUFFER_SIZE) {
      logInfo(`[${reqId}] Buffer full for ${participantId}, triggering processing...`);
      // Process asynchronously, don't wait for completion
      processAudioBuffer(participantId, effectiveRequestId)
        .catch(procError => logError(`[${reqId}] Error during async processAudioBuffer call:`, procError)); 
        
      res.writeHead(202, { // 202 Accepted for processing
        'Content-Type': 'application/json',
        'X-Request-ID': effectiveRequestId,
        'X-Session-ID': effectiveSessionId || 'none',
        'X-Participant-ID': participantId
      });
      res.end(JSON.stringify({ status: 'processing', requestId: effectiveRequestId, participantId, sessionId: effectiveSessionId || null }));
      logInfo(`[${reqId}] Responded 202 Accepted (Processing)`);
    } else {
      logInfo(`[${reqId}] Buffer not full (${buffer.length}/${BUFFER_SIZE}), acknowledging receipt.`);
      res.writeHead(200, { // 200 OK - Received
        'Content-Type': 'application/json',
        'X-Request-ID': effectiveRequestId,
        'X-Session-ID': effectiveSessionId || 'none',
        'X-Participant-ID': participantId
      });
      res.end(JSON.stringify({ status: 'received', requestId: effectiveRequestId, participantId, sessionId: effectiveSessionId || null, chunksReceived: buffer.length, chunksNeeded: BUFFER_SIZE }));
      logInfo(`[${reqId}] Responded 200 OK (Received)`);
    }
  } catch (error) {
    logError(`[${reqId}] Unhandled error in handleAudioPost:`, error);
    logDebug(`[${reqId}] Stack trace:`, error.stack);
    try {
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error handling audio POST', message: error.message }));
        } else {
            res.end(); // Attempt to close if headers already sent
        }
    } catch (responseError) {
        logError(`[${reqId}] Error sending error response after unhandled exception:`, responseError);
    }
  }
}

/**
 * Send an SSE event to the client
 * @param {http.ServerResponse} res - The response object
 * @param {string} event - The event name
 * @param {*} data - The data to send
 * @param {Object} options - Additional options
 * @param {string} [options.id] - Optional event ID for resuming streams
 * @param {number} [options.retry] - Optional retry timeout in milliseconds
 * @param {string} [options.reqId] - Optional request ID for logging
 * @param {string} [options.sessionId] - Optional session ID for logging
 */
function sendSSE(res, event, data, options = {}) {
  const { reqId = 'sse-send', sessionId = 'unknown' } = options;
  try {
    // Skip if response is already sent or connection closed/destroyed
    if (!res || res.writableEnded || res.writableFinished || res.socket?.destroyed) {
      logWarn(`[${reqId}/${sessionId}] Attempted to send SSE event '${event}' but response/socket is not writable.`);
      return;
    }
    
    // Log the raw data object BEFORE stringifying, especially for the 'open' event
    logDebug(`[${reqId}/${sessionId}] Preparing SSE event '${event}' with data object:`, data);
    if (event === 'open' && (!data || typeof data !== 'object' || !data.sessionId)) {
         logError(`[${reqId}/${sessionId}] CRITICAL: Invalid or missing sessionId in data for 'open' event! Data:`, data);
    }

    let sseData;
    try {
        sseData = typeof data === 'object' ? JSON.stringify(data) : String(data);
        logDebug(`[${reqId}/${sessionId}] Stringified SSE data for event '${event}':`, sseData);
    } catch (stringifyError) {
        logError(`[${reqId}/${sessionId}] CRITICAL: Failed to stringify data for event '${event}':`, stringifyError);
        logDebug(`[${reqId}/${sessionId}] Original data causing stringify error:`, data);
        // Send an error event back to the client instead
        event = 'error';
        sseData = JSON.stringify({ message: 'Internal server error preparing event data.', type: 'server_error', originalEvent: event });
        logWarn(`[${reqId}/${sessionId}] Sending error event instead due to stringify failure.`);
    }
    
    // Double-check after stringify, especially if stringify failed and we defaulted to error
    if (sseData === undefined || sseData === null || sseData === '') {
        logWarn(`[${reqId}/${sessionId}] Stringified SSE data is empty or invalid for event '${event}'. Original data:`, data);
        // Avoid sending empty data field, especially critical for 'open'
        if (event === 'open') {
            logError(`[${reqId}/${sessionId}] Aborting send for 'open' event due to missing/invalid sessionId after stringify.`);
            return; 
        }
    }

    let message = '';
    if (options.id) message += `id: ${options.id}\n`;
    if (options.retry) message += `retry: ${options.retry}\n`;
    message += `event: ${event}\n`;
    
    // Handle potential multiline data correctly
    // Ensure sseData is treated as a string here
    String(sseData).split('\n').forEach(line => {
      message += `data: ${line}\n`;
    });
    message += '\n'; // End of message marker
    
    // Log the final message string being written
    logDebug(`[${reqId}/${sessionId}] Writing SSE message for event '${event}':\n${message}`);

    // Send the message
    const success = res.write(message);
    
    // Handle backpressure if write returns false
    if (!success) {
      logWarn(`[${reqId}/${sessionId}] Backpressure detected sending SSE event '${event}'. Waiting for drain.`);
      res.once('drain', () => {
        logInfo(`[${reqId}/${sessionId}] SSE write buffer drained.`);
      });
    }
    
    // Avoid logging frequent heartbeats unless debugging
    if (event !== 'heartbeat' || process.env.DEBUG_PROXY === 'true') {
        logInfo(`[${reqId}/${sessionId}] Sent SSE event: '${event}'${options.id ? ` (ID: ${options.id})` : ''}`);
        // logDebug(`[${reqId}/${sessionId}] SSE Data:`, sseData); // Already logged above
    }

  } catch (error) {
    logError(`[${reqId}/${sessionId}] Error sending SSE event '${event}':`, error);
    // Attempt to close the response stream on error
    try {
        if (res && !res.writableEnded) {
            res.end();
        }
    } catch (endError) {
        logError(`[${reqId}/${sessionId}] Error trying to end response after SSE send error:`, endError);
    }
    // Clean up the connection state if possible
    if (sessionId !== 'unknown') {
        // Assuming cleanupSSEConnection exists and handles removing from sseConnections map etc.
        cleanupSSEConnection(sessionId, 'send_error', null, error.message); 
    }
  }
}

/**
 * Start session cleanup interval
 */
function startSessionCleanup() {
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
  }
  logInfo('Starting session cleanup interval...');
  sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    logDebug(`Running session cleanup. Current sessions: ${activeSessions.size}`);
    
    for (const [sessionId, session] of activeSessions.entries()) {
      // Clean up if session is inactive AND both SSE/WS are inactive (or never connected)
      if (now - session.lastActive > SESSION_TIMEOUT && !session.sseActive && !session.wsActive) {
        logInfo(`Cleaning up expired/inactive session: ${sessionId}`);
        
        const participantId = session.participantId;
        if (participantId) {
          logDebug(`Removing associated participant connection: ${participantId}`);
          activeConnections.delete(participantId);
          logDebug(`Removing associated audio buffer for: ${participantId}`);
          audioBuffers.delete(participantId);
        }
        
        // Ensure SSE resources are cleaned (though should be via close events)
        if (sseConnections.has(sessionId)) {
           logWarn(`Found lingering SSE connection during cleanup for ${sessionId}. Forcing cleanup.`);
           const sseInfo = sseConnections.get(sessionId); // Get info before deleting
           if (sseInfo?.heartbeatInterval) {
               clearInterval(sseInfo.heartbeatInterval);
           }
           sseConnections.delete(sessionId);
        }
        
        activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }
    if (cleanedCount > 0) {
        logInfo(`Session cleanup finished. Removed ${cleanedCount} expired sessions. Remaining: ${activeSessions.size}`);
    } else {
        logDebug(`Session cleanup finished. No expired sessions found. Remaining: ${activeSessions.size}`);
    }
  }, 60000); // Run every minute
}

/**
 * Process audio buffer for a participant, send to Replicate, and handle response.
 * @param {string} participantId - The unique ID of the participant.
 * @param {string} requestId - The ID of the request triggering processing.
 */
async function processAudioBuffer(participantId, requestId) {
  logInfo(`[${requestId}] Processing audio buffer for participant: ${participantId}`);
  
  const connection = activeConnections.get(participantId);
  if (!connection) {
    logError(`[${requestId}] No connection found for participant ${participantId} during buffer processing.`);
    return;
  }
  const sessionId = connection.sessionId; // Get session ID for logging/SSE
  
  // Get buffer and create a copy before clearing
  const bufferItems = [...(audioBuffers.get(participantId) || [])];
  // Clear the buffer immediately to allow for next chunks
  audioBuffers.set(participantId, []); 
  
  if (bufferItems.length === 0) {
    logWarn(`[${requestId}/${sessionId || 'N/A'}] Audio buffer was empty for participant ${participantId}. Skipping processing.`);
    return;
  }
  
  try {
    let result;
    
    // Sort buffer items by chunk number if available
    bufferItems.sort((a, b) => (a.chunkNumber || 0) - (b.chunkNumber || 0));
    logInfo(`[${requestId}/${sessionId || 'N/A'}] Sorted ${bufferItems.length} audio chunks for ${participantId}.`);
    
    // Extract audio data from buffer items
    const audioData = bufferItems.map(item => item.data);
    
    // Combine audio chunks
    const combinedAudio = audioData.join('');
    logInfo(`[${requestId}/${sessionId || 'N/A'}] Combined audio data length: ${combinedAudio.length} chars for ${participantId}.`);
    
    // Send processing status to participant
    sendResultToParticipant(participantId, {
      type: 'status',
      status: 'processing',
      message: "Processing audio..." // Updated message
    }, requestId);
    
    // --- Replicate API Call ---
    // Only attempt Replicate API call if credentials are available
    if (process.env.REPLICATE_API_TOKEN && process.env.ULTRAVOX_MODEL_VERSION) {
      logInfo(`[${requestId}/${sessionId || 'N/A'}] Sending prediction request to Replicate for participant ${participantId}...`);
      
      // Basic validation
      if (!combinedAudio || combinedAudio.length < 100) { // Arbitrary small length check
        logWarn(`[${requestId}/${sessionId || 'N/A'}] Combined audio data length (${combinedAudio.length}) seems too short. Proceeding anyway.`);
      }
      // Verify it looks like base64 data - simple check
      if (!combinedAudio.match(/^[A-Za-z0-9+/=]+$/)) {
         logWarn(`[${requestId}/${sessionId || 'N/A'}] Combined audio data does not appear to be valid base64.`);
         // Consider sending an error back here if validation is critical
      }

      // Prepare request payload with shop context
      const payload = {
        version: process.env.ULTRAVOX_MODEL_VERSION,
        input: {
          command: '',  // Empty command, using audio only
          audio: combinedAudio,
          shop_domain: connection.shopId,
          // Ensure cart context is stringified if it's an object
          cart_context: connection.cartContext ? 
             (typeof connection.cartContext === 'string' ? connection.cartContext : JSON.stringify(connection.cartContext)) 
             : ''
        }
      };
      logDebug(`[${requestId}/${sessionId || 'N/A'}] Replicate Payload (excluding audio):`, { ...payload.input, audio: `(length: ${combinedAudio.length})` });

      let predictionResult = null;
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
          logError(`[${requestId}/${sessionId || 'N/A'}] Replicate API error (${response.status}): ${errorText}`);
          // Consider logging payload only on error for sensitive data
          // logDebug(`[${requestId}/${sessionId || 'N/A'}] Request payload causing error:`, payload); 
          throw new Error(`Replicate API Error (${response.status})`);
        }
        
        const prediction = await response.json();
        logInfo(`[${requestId}/${sessionId || 'N/A'}] Replicate prediction initiated: ID=${prediction.id}, Status=${prediction.status}`);
        logDebug(`[${requestId}/${sessionId || 'N/A'}] Replicate initial response:`, prediction);
        
        if (prediction.status === 'succeeded') {
          // Handle immediate success (less common for audio)
          logInfo(`[${requestId}/${sessionId || 'N/A'}] Prediction ${prediction.id} succeeded immediately.`);
          predictionResult = prediction.output; // Output might be string or object
        } else if (prediction.status === 'processing' || prediction.status === 'starting') {
          // For async processing (normal case), poll for result
          logInfo(`[${requestId}/${sessionId || 'N/A'}] Prediction ${prediction.id} is processing. Starting polling...`);
          // Send initial "processing" message to client (already sent above, maybe update?)
          // sendResultToParticipant(participantId, { type: 'status', status: 'processing', message: "AI is thinking..." }, requestId);
          
          // Poll for complete result
          predictionResult = await pollPredictionResult(prediction.id, participantId, requestId);
          
        } else {
          // Failed or other unexpected status
          logError(`[${requestId}/${sessionId || 'N/A'}] Unexpected initial prediction status: ${prediction.status}. Error: ${prediction.error}`);
          sendErrorToParticipant(participantId, `AI processing failed (Status: ${prediction.status})`, requestId);
          return; // Stop processing on unexpected status
        }

      } catch (apiError) {
        logError(`[${requestId}/${sessionId || 'N/A'}] Error calling Replicate API:`, apiError);
        // Consider more specific error message based on apiError type if possible
        sendErrorToParticipant(participantId, "Failed to communicate with AI service.", requestId);
        return; // Stop processing on API error
      }

      // --- Handle Prediction Result ---
      if (predictionResult) {
        logInfo(`[${requestId}/${sessionId || 'N/A'}] Received final prediction result for ${participantId}.`);
        logDebug(`[${requestId}/${sessionId || 'N/A'}] Raw Prediction Output:`, predictionResult);
        try {
            let parsedResult;
            // Attempt to parse if it's a string, otherwise assume it's already an object
            if (typeof predictionResult === 'string') {
                parsedResult = JSON.parse(predictionResult);
            } else {
                parsedResult = predictionResult; 
            }
            logInfo(`[${requestId}/${sessionId || 'N/A'}] Parsed prediction result for ${participantId}.`);
            logDebug(`[${requestId}/${sessionId || 'N/A'}] Parsed Result:`, parsedResult);
            // Send the successfully parsed or already object result
            sendResultToParticipant(participantId, parsedResult, requestId);
        } catch (parseError) {
            logError(`[${requestId}/${sessionId || 'N/A'}] Error parsing prediction output JSON for ${participantId}:`, parseError);
            logDebug(`[${requestId}/${sessionId || 'N/A'}] Output causing parse error:`, predictionResult);
            // Send the raw string output if parsing fails but we got something
            sendResultToParticipant(participantId, { message: String(predictionResult), action: "none", error: "Result parsing failed" }, requestId);
        }
      } else {
        // Polling failed or timed out
        logWarn(`[${requestId}/${sessionId || 'N/A'}] Prediction polling failed or timed out for ${participantId}. Sending fallback.`);
        sendResultToParticipant(participantId, fallbackResponse, requestId); // Use fallback if polling failed
      }

    } else {
      // --- Fallback if No API Credentials ---
      logWarn(`[${requestId}/${sessionId || 'N/A'}] Replicate API credentials not set. Using fallback response for ${participantId}.`);
      sendResultToParticipant(participantId, fallbackResponse, requestId);
    }
  } catch (error) {
    logError(`[${requestId}/${sessionId || 'N/A'}] Unhandled error in processAudioBuffer for ${participantId}:`, error);
    sendErrorToParticipant(participantId, 'Internal error processing audio.', requestId);
  }
}


/**
 * Poll for prediction result from Replicate.
 * @param {string} predictionId - The ID of the prediction to poll.
 * @param {string} participantId - The ID of the participant (for logging and connection check).
 * @param {string} requestId - The ID of the original request (for logging).
 * @returns {Promise<object|string|null>} The prediction output or null if failed/timed out.
 */
async function pollPredictionResult(predictionId, participantId, requestId) {
  const sessionId = activeConnections.get(participantId)?.sessionId;
  logInfo(`[${requestId}/${sessionId || 'N/A'}] Starting polling for prediction: ${predictionId}`);

  for (let attempt = 0; attempt < REPLICATE_MAX_POLL_ATTEMPTS; attempt++) {
    // --- Check Connection Status ---
    // Check if the participant's connection (WS or associated SSE session) is still active
    const connection = activeConnections.get(participantId);
    const session = sessionId ? activeSessions.get(sessionId) : null;
    // If no connection entry, or session exists but both SSE and WS are inactive, abort polling
    if (!connection || (session && !session.sseActive && !session.wsActive)) {
        logWarn(`[${requestId}/${sessionId || 'N/A'}] Connection/Session closed for participant ${participantId} during polling for ${predictionId}. Aborting poll.`);
        return null;
    }

    logDebug(`[${requestId}/${sessionId || 'N/A'}] Polling attempt ${attempt + 1}/${REPLICATE_MAX_POLL_ATTEMPTS} for prediction ${predictionId}...`);
    try {
      const response = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Token ${process.env.REPLICATE_API_TOKEN}` }
      });

      if (!response.ok) {
        logError(`[${requestId}/${sessionId || 'N/A'}] Error polling prediction ${predictionId} (Attempt ${attempt + 1}): Status ${response.status}`);
        // Consider breaking or implementing backoff on specific error codes (e.g., 429 Too Many Requests)
        await new Promise(resolve => setTimeout(resolve, REPLICATE_POLL_INTERVAL));
        continue; // Continue polling even on transient errors for now
      }

      const predictionStatus = await response.json();
      logDebug(`[${requestId}/${sessionId || 'N/A'}] Poll response for ${predictionId} (Attempt ${attempt + 1}): Status=${predictionStatus.status}`);

      if (predictionStatus.status === 'succeeded') {
        logInfo(`[${requestId}/${sessionId || 'N/A'}] Prediction ${predictionId} succeeded after ${attempt + 1} attempts.`);
        return predictionStatus.output; // Return the output (can be string or object)
      } else if (predictionStatus.status === 'failed') {
        logError(`[${requestId}/${sessionId || 'N/A'}] Prediction ${predictionId} failed. Error: ${predictionStatus.error}`);
        logDebug(`[${requestId}/${sessionId || 'N/A'}] Full failed prediction status:`, predictionStatus);
        return null; // Stop polling on failure
      }
      // If status is 'starting' or 'processing', loop will continue

    } catch (error) {
      logError(`[${requestId}/${sessionId || 'N/A'}] Network or fetch error during polling for ${predictionId} (Attempt ${attempt + 1}):`, error);
      // Continue polling after network errors, maybe add a delay
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, REPLICATE_POLL_INTERVAL));
  }

  logWarn(`[${requestId}/${sessionId || 'N/A'}] Polling for prediction ${predictionId} timed out after ${REPLICATE_MAX_POLL_ATTEMPTS} attempts.`);
  return null; // Timeout
}

/**
 * Send result back to the participant via SSE or WebSocket.
 * @param {string} participantId - The ID of the participant.
 * @param {object} result - The result object to send.
 * @param {string} requestId - The ID of the original request.
 */
function sendResultToParticipant(participantId, result, requestId) {
  const connection = activeConnections.get(participantId);
  if (!connection) {
    logError(`[${requestId}] Cannot send result: No connection found for participant ${participantId}`);
    return;
  }
  const sessionId = connection.sessionId;
  logInfo(`[${requestId}/${sessionId || 'N/A'}] Attempting to send result to participant ${participantId}`);
  logDebug(`[${requestId}/${sessionId || 'N/A'}] Result data:`, result);

  try {
    // Ensure payload has a type, default to 'result'
    const payload = { ...result, requestId, type: result.type || 'result' }; 

    // --- Try SSE First (Primary Channel) ---
    if (sessionId && sseConnections.has(sessionId)) {
      const sseInfo = sseConnections.get(sessionId);
      // Check if response object and socket are still valid
      if (sseInfo.res && !sseInfo.res.writableEnded && !sseInfo.res.socket?.destroyed) {
        sendSSE(sseInfo.res, payload.type, payload, { reqId: requestId, sessionId });
        logInfo(`[${requestId}/${sessionId}] Sent result via SSE to session ${sessionId}`);
        return; // Sent via SSE, done.
      } else {
         logWarn(`[${requestId}/${sessionId}] SSE connection for session ${sessionId} found but not writable.`);
         // Don't return yet, try WebSocket fallback
      }
    }

    // --- Fallback to WebSocket (Legacy) ---
    if (connection.ws && connection.ws.readyState === 1) { // 1 === WebSocket.OPEN
      connection.ws.send(JSON.stringify(payload));
      logInfo(`[${requestId}/${sessionId || 'N/A'}] Sent result via WebSocket (fallback) to participant ${participantId}`);
      return; // Sent via WS, done.
    }
    
    // If neither SSE nor WS was available and writable
    logWarn(`[${requestId}/${sessionId || 'N/A'}] No active & writable SSE or WebSocket connection found for participant ${participantId} to send result.`);

  } catch (error) {
    logError(`[${requestId}/${sessionId || 'N/A'}] Error sending result to participant ${participantId}:`, error);
  }
}

/**
 * Send error message to the participant via SSE or WebSocket.
 * @param {string} participantId - The ID of the participant.
 * @param {string} errorMessage - The error message to send.
 * @param {string} requestId - The ID of the original request.
 */
function sendErrorToParticipant(participantId, errorMessage, requestId) {
   const connection = activeConnections.get(participantId);
  if (!connection) {
    logError(`[${requestId}] Cannot send error: No connection found for participant ${participantId}`);
    return;
  }
  const sessionId = connection.sessionId;
  // Use logError for sending errors, but maybe downgrade if it's a common/expected error
  logError(`[${requestId}/${sessionId || 'N/A'}] Attempting to send error to participant ${participantId}: "${errorMessage}"`);

  try {
    // Standardized error payload
    const errorPayload = { message: errorMessage, requestId, type: 'error' };

    // --- Try SSE First ---
    if (sessionId && sseConnections.has(sessionId)) {
      const sseInfo = sseConnections.get(sessionId);
      // Check writability
      if (sseInfo.res && !sseInfo.res.writableEnded && !sseInfo.res.socket?.destroyed) {
        sendSSE(sseInfo.res, 'error', errorPayload, { reqId: requestId, sessionId });
        logInfo(`[${requestId}/${sessionId}] Sent error via SSE to session ${sessionId}`);
        return; 
      } else {
         logWarn(`[${requestId}/${sessionId}] SSE connection for session ${sessionId} found but not writable for sending error.`);
      }
    }

    // --- Fallback to WebSocket ---
    if (connection.ws && connection.ws.readyState === 1) { // WebSocket.OPEN
      connection.ws.send(JSON.stringify(errorPayload)); // Send full payload for consistency
      logInfo(`[${requestId}/${sessionId || 'N/A'}] Sent error via WebSocket (fallback) to participant ${participantId}`);
      return; 
    }
    
    logWarn(`[${requestId}/${sessionId || 'N/A'}] No active & writable SSE or WebSocket connection found for participant ${participantId} to send error.`);

  } catch (error) {
    logError(`[${requestId}/${sessionId || 'N/A'}] Error sending error message to participant ${participantId}:`, error);
  }
}

// Default export for compatibility
export default {
  initLiveKitProxy
};