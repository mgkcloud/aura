# Voice Assistant Implementation Plan for Shopify

## Overview
The Voice AI Shopping Assistant is a Shopify app that enables voice-based navigation and assistance for online shoppers. It consists of a frontend theme extension providing a floating voice assistant button and an expandable information window, with backend processing powered by the Ultravox AI model through Replicate.

## 1. Architecture & Core Components

### 1.1. Core Components
- **Shopify App**: Built with Remix framework for backend processing
- **Theme Extension**: Frontend voice assistant interface for shoppers
- **Audio Processing**: Server for handling real-time audio streaming
- **AI Model**: Ultravox via Replicate API for speech understanding and tool calling
- **Tool Framework**: System for executing product searches and UI actions based on user intent

### 1.2. Data Flow
1. Shopper activates the voice assistant button on the storefront
2. Audio is captured in the browser and sent to the backend
3. Backend processes the audio and sends to the Ultravox model
4. Ultravox generates a response with optional tool calls
5. Backend executes any tool calls (product search, UI actions)
6. Response is streamed back to the frontend
7. Frontend displays information and/or executes navigation

## 2. Server-Side Implementation

### 2.1. Update Proxy Route Handler
- **File**: `/app/routes/proxy.tsx`
- **Tasks**:
  - ~~Implement WebSocket connection handling~~ (REMOVED - Migrated to HTTP/SSE)
  - 🔄 Convert to HTTP POST endpoint for audio data submission
    - ✅ Set up POST handler for audio chunks
    - ✅ Add support for base64 encoded audio
    - 🔄 Implement chunking and progress tracking
  - 🔄 Implement SSE (Server-Sent Events) for response streaming
    - ✅ Set up initial SSE handler function
    - 🔄 Add proper headers for SSE connections
    - 🔄 Create streaming response format
    - 🔄 Implement heartbeat for connection maintenance
  - ✅ Set up proper CORS headers for cross-origin requests
    - ✅ Add CORS headers to all responses
    - ✅ Support OPTIONS preflight requests
    - ✅ Add participant tracking and session management
      - ✅ Generate unique participant IDs
      - ✅ Store session data with shop information

### 2.2. Configure Audio Processing Server
- **File**: `/app/livekit-proxy.server.js`
- **Tasks**:
  - ✅ Fix ES module compatibility issues
    - ✅ Update import/export syntax
    - ✅ Configure proper module loading
  - ✅ Configure audio buffer management for optimal processing
    - ✅ Set up buffer sizes for speech recognition
    - ✅ Implement proper audio parameter handling
  - ✅ Implement connection with Replicate API for Ultravox model
    - ✅ Configure API authentication
    - ✅ Set up proper request format
    - ✅ Add error handling for API calls
  - ✅ Set up connection error handling
    - ✅ Add timeout handling
    - ✅ Implement reconnection logic
  - ✅ Ensure proper cleanup of resources when connections close
    - ~~Clean up WebSocket connections~~ (REMOVED)
    - ✅ Release audio resources
  - 🔄 Implement streaming responses via SSE
    - 🔄 Convert chunked responses to SSE format
    - 🔄 Add event typing for different message types
    - 🔄 Implement progressive response handling

~~### 2.3. Add WebSocket Support Route~~ (REMOVED - File deleted)
~~- **File**: `/app/routes/proxy.ws.tsx`~~
~~- **Tasks**:~~
  ~~- Create dedicated WebSocket route~~
  ~~- Implement connection upgrade handling~~
  ~~- Add error handling for connection failures~~

## 3. Client-Side Implementation

### 3.1. Update Voice Assistant Integration
- **File**: `/extensions/voice-assistant/assets/voice-assistant-integration.js`
- **Tasks**:
  - ✅ Implement high-quality audio capture
    - ✅ Configure optimal audio parameters (16kHz, mono)
    - ✅ Add noise suppression and echo cancellation
    - ✅ Implement proper audio track management
  - ✅ Set optimal audio parameters (16kHz, mono, noise reduction)
    - ✅ Configure constraints for getUserMedia
    - ✅ Set up proper audio processing nodes
  - 🔄 Replace WebSocket sending with HTTP POST
    - 🔄 Create fetch-based audio sending function
    - 🔄 Implement proper error handling
    - 🔄 Add retry logic for failed requests
  - 🔄 Implement SSE connection for receiving responses
    - 🔄 Create EventSource connection
    - 🔄 Set up event listeners for different message types
    - 🔄 Implement reconnection logic
  - ✅ Provide visualizer data for UI
    - ✅ Extract frequency data from audio stream
    - ✅ Format data for visualization
    - ✅ Implement callback mechanism for UI updates

### 3.2. Update Voice Assistant Interface
- **File**: `/extensions/voice-assistant/assets/voice-assistant.js`
- **Tasks**:
  - ✅ Create responsive visualization that works with audio levels
    - ✅ Implement visual effects based on audio frequency
    - ✅ Add smooth transitions between audio states
    - ✅ Create fallback visualization for inactive state
  - ✅ Implement proper error handling for connection failures
    - ✅ Display user-friendly error messages
    - ✅ Add retry functionality
    - ✅ Implement graceful degradation
  - ✅ Add UI state management for different connection states
    - ✅ Create distinct visual states for listening/processing/speaking
    - ✅ Add proper transitions between states
    - ✅ Implement loading indicators
  - ✅ Add proper resource cleanup to prevent memory leaks
    - ✅ Stop audio tracks when not in use
    - ✅ Cancel animation frames when hidden
    - ✅ Remove event listeners when destroying
  - 🔄 Implement SSE event listeners for streaming responses
    - 🔄 Create event handling functions for different message types
    - 🔄 Update UI based on streaming response chunks
    - 🔄 Add progressive UI updates as response arrives
  - ❌ Add text-to-speech for voice responses
    - ❌ Implement Web Speech API integration
    - ❌ Configure voice settings
    - ❌ Add playback controls
    - ❌ Implement fallback for unsupported browsers

### 3.3. Update App Block
- **File**: `/extensions/voice-assistant/blocks/voice-assistant.liquid`
- **Tasks**:
  - ✅ Ensure proper script loading
    - ✅ Add correct script tags and dependencies
    - ✅ Set up async loading where appropriate
  - ✅ Set up theme extension structure
    - ✅ Configure block structure
    - ✅ Add required HTML elements
  - ✅ Configure extension settings in TOML file
    - ✅ Set up extension metadata
    - ✅ Add settings schema

## 4. AI Model Integration

### 4.1. Ultravox Model Integration
- **Tasks**:
  - ✅ Set up Replicate account and API access
    - ✅ Create account and generate API key
    - ✅ Configure authentication
  - ✅ Configure Ultravox model parameters
    - ✅ Set up model version
    - ✅ Configure input parameters
  - ✅ Implement audio data preparation for model
    - ✅ Format audio data correctly
    - ✅ Add metadata and context
  - ✅ Set up proper request format
    - ✅ Create request structure
    - ✅ Add shop context
  - 🔄 Implement streaming response parsing
    - 🔄 Create parser for streamed responses
    - 🔄 Handle partial JSON in streams
    - 🔄 Implement progressive processing
  - ❌ Set up tool calling framework
    - ❌ Define tool schemas for Ultravox
    - ❌ Create tool execution pipeline
    - ❌ Implement result handling

### 4.2. Environment Configuration
- **File**: `/.env` and `/.env.example`
- **Tasks**:
  - ✅ Add Replicate API key configuration
    - ✅ Set up secure storage of API keys
    - ✅ Add documentation for key setup
  - ✅ Configure Ultravox model version
    - ✅ Add model version variable
    - ✅ Document version update process
  - ✅ Set up URLs and other connection parameters
    - ✅ Configure LiveKit URLs (Now `LIVEKIT_PROXY_URL`)
    - ✅ Set API endpoints
    - ✅ Add timeout settings

## 5. Tool Calling Framework

### 5.1. Define Tool Schema
- **Tasks**:
  - ❌ Create JSON schema for each tool
    - ❌ Define common schema format
    - ❌ Create validation functions
  - ❌ Define product search tool parameters
    - ❌ Specify query parameters
    - ❌ Add filter options
    - ❌ Define sort parameters
  - ❌ Define UI display tool parameters
    - ❌ Create product display parameters
    - ❌ Add message display options
    - ❌ Define action button parameters
  - ❌ Define navigation tool parameters
    - ❌ Specify URL parameters
    - ❌ Add transition options
    - ❌ Create confirmation parameters

### 5.2. Implement Tool Execution
- **Tasks**:
  - ❌ Implement product search with Shopify Storefront API
    - ❌ Create GraphQL queries for product search
    - ❌ Add filter implementation
    - ❌ Implement result processing
  - ❌ Create UI display functionality
    - ❌ Implement product display components
    - ❌ Add message formatting
    - ❌ Create loading states
  - ❌ Implement page navigation
    - ❌ Add history API integration
    - ❌ Create smooth transitions
    - ❌ Implement state persistence
  - ❌ Add result formatting for frontend
    - ❌ Create response structure
    - ❌ Implement JSON serialization
    - ❌ Add error handling

## 6. MVP Features to Implement

### 6.1. SSE Implementation (HIGHEST PRIORITY)
- **Files**: `/app/routes/proxy.tsx` (Note: `proxy.ws.tsx` removed)
- **Tasks**:
  - ✅ Convert WebSocket endpoint to support Server-Sent Events
    - ✅ Create SSE endpoint with proper headers
    - ✅ Implement connection handling
    - ✅ Add participant tracking for SSE connections
  - ✅ Implement event stream response format in backend
    - ✅ Create standardized event format
    - ✅ Add event types (message, error, heartbeat)
    - ✅ Implement proper event serialization
  - ✅ Set up appropriate headers for SSE connections
    - ✅ Add Content-Type for event streams
    - ✅ Configure cache control
    - ✅ Set up CORS for SSE connections
  - ✅ Create client-side event stream listener
    - ✅ Implement EventSource connection
    - ✅ Add event type handlers
    - ✅ Create message processing pipeline
  - ✅ Add reconnection handling for dropped connections
    - ✅ Implement exponential backoff
    - ✅ Add connection state tracking
    - ✅ Create user feedback for reconnection attempts
  - 🔄 Test with various network conditions
    - 🔄 Simulate slow connections
    - 🔄 Test connection drops
    - 🔄 Verify reconnection behavior

### 6.2. Audio HTTP POST Implementation
- **Files**: `/extensions/voice-assistant/assets/voice-assistant-integration.js` and `/app/routes/proxy.tsx`
- **Details**: 
  - **Current Status**: Implemented. The fetch-based audio sending is now complete with proper error handling and timeout logic.
  - **Technical Approach**: Using fetch API with proper timeouts and retry logic.
- **Tasks**:
  - ✅ Modify audio sending to use HTTP POST requests
    - ✅ Create fetch-based audio sending function
    - ✅ Implement proper content-type headers
    - ✅ Add metadata to requests (shop, session)
  - ✅ Implement chunking for large audio files
    - ✅ Create optimal chunk size determination
    - ✅ Add sequence numbering
    - ✅ Implement chunk assembly on server
  - ✅ Add progress tracking for audio uploads
    - ✅ Create progress callback mechanism
    - ✅ Add UI indicators for upload progress
    - ✅ Implement abort capability for long uploads
  - ✅ Configure proper request headers
    - ✅ Set content type and length
    - ✅ Add authentication headers
    - ✅ Configure CORS requirements
  - ✅ Implement error handling for failed uploads
    - ✅ Add timeout handling
    - ✅ Implement retry logic with backoff
    - ✅ Create user-friendly error messages
    - ✅ Add detailed error logging

### 6.3. Text-to-Speech Implementation
- **Details**: 
  - **Approach**: Use Web Speech API for browsers that support it with a fallback option.
  - **Current Status**: Not started.
- **Tasks**:
  - ❌ Research TTS service options (browser-based vs. server)
    - ❌ Evaluate Web Speech API compatibility
    - ❌ Research cloud TTS services
    - ❌ Compare quality and performance
    - ❌ Create comparison document for decision
  - ❌ Implement Web Speech API for client-side TTS
    - ❌ Create wrapper function for synthesis
    - ❌ Add browser compatibility detection
    - ❌ Implement fallback mechanisms
    - ❌ Add event handlers for speech events
  - ❌ Configure voice parameters and settings
    - ❌ Select appropriate voice
    - ❌ Configure rate and pitch
    - ❌ Add language detection and setting
    - ❌ Create natural-sounding pauses and intonation
  - ❌ Create audio playback functionality
    - ❌ Implement play/pause controls
    - ❌ Add volume adjustment
    - ❌ Create visual indication of speaking state
    - ❌ Implement text highlighting during speech
  - ❌ Add controls for volume and playback rate
    - ❌ Create user interface for controls
    - ❌ Implement preference saving
    - ❌ Add keyboard shortcuts
    - ❌ Create accessibility-friendly controls

### 6.4. Product Search Tool
- **Details**:
  - **Approach**: Implement a JSON schema-based tool for product searches that connects to Shopify's Storefront API.
  - **Current Status**: Not started.
- **Tasks**:
  - ❌ Define product search parameters (query, filters, sort)
    - ❌ Create schema for search parameters
    - ❌ Define filter options (price, category, etc.)
    - ❌ Implement sort parameters
    - ❌ Add pagination options
  - ❌ Implement Shopify Storefront API integration
    - ❌ Create GraphQL query builder
    - ❌ Implement authentication
    - ❌ Add caching for performance
    - ❌ Create error handling
  - ❌ Create product result formatting
    - ❌ Design result format structure
    - ❌ Implement thumbnail and image handling
    - ❌ Add price formatting
    - ❌ Create availability indicators
  - ❌ Add product display components
    - ❌ Create product card component
    - ❌ Implement product carousel
    - ❌ Add quick view functionality
    - ❌ Create loading states
  - ❌ Implement navigation to product pages
    - ❌ Add product page URL generation
    - ❌ Implement transition effects
    - ❌ Create breadcrumb generation
    - ❌ Add history state management

### 6.5. Enhanced Error Handling
- **Details**:
  - **Approach**: Create a comprehensive error handling system with meaningful user feedback and recovery mechanisms.
  - **Current Status**: Basic error handling implemented, needs enhancement.
- **Tasks**:
  - 🔄 Create comprehensive error detection system
    - 🔄 Define error categories and codes
    - 🔄 Implement centralized error tracking
    - 🔄 Create error logging pipeline
    - 🔄 Add error severity classification
  - 🔄 Implement meaningful error messages for users
    - 🔄 Create user-friendly message templates
    - 🔄 Add contextual help suggestions
    - 🔄 Implement action recommendations
    - 🔄 Create error message localization
  - 🔄 Add fallback mechanisms for different failure points
    - 🔄 Implement feature degradation paths
    - 🔄 Create fallback UI states
    - 🔄 Add offline support where possible
    - 🔄 Implement text input fallback for voice failures
  - 🔄 Create a recovery hierarchy for degraded operation
    - 🔄 Define feature importance hierarchy
    - 🔄 Implement progressive enhancement
    - 🔄 Create recovery sequence for reconnection
    - 🔄 Add state persistence for recovery
  - 🔄 Implement error logging and monitoring
    - 🔄 Create detailed error logs
    - 🔄 Add error categorization
    - 🔄 Implement log collection
    - 🔄 Create monitoring dashboard

### 6.6. Backend LiveKit Proxy Updates
- **Files**: `/app/livekit-proxy.server.js` and related Docker configurations
- **Details**:
  - **Current Status**: Only supports WebSocket, lacks HTTP POST and SSE handling (Note: WebSocket support now removed)
  - **Technical Approach**: Update server to handle both communication methods
- **Tasks**:
  - 🔄 Add HTTP endpoint for audio POST requests
    - 🔄 Extend the http.createServer handler to process POST requests
    - 🔄 Add proper content-type and CORS handling
    - 🔄 Implement audio buffer handling from POST data
    - 🔄 Support chunk sequence tracking for better audio assembly
  - 🔄 Implement SSE support for streaming responses
    - ✅ Create handler for SSE connection requests
    - ✅ Implement proper SSE headers and event formatting
    - ✅ Add support for different event types (message, result, error)
    - ✅ Create heartbeat mechanism to keep connections alive
  - 🔄 Add session management for SSE connections
    - 🔄 Create session tracking store with unique IDs
    - 🔄 Link sessions to shop domains and participant IDs
    - 🔄 Implement session expiration and cleanup
    - 🔄 Associate audio POST requests with active sessions
  - 🔄 Update Docker configuration for new server capabilities
    - 🔄 Ensure proper environment variables are passed
    - ✅ Update health check to verify HTTP endpoint only
    - 🔄 Add volume mounts for easier development and debugging
    - 🔄 Implement proper logging for both connection types
  - 🔄 Update server.js entry point
    - 🔄 Add graceful shutdown handlers for all connection types
    - 🔄 Implement cleaner error handling and reporting
    - 🔄 Add proper startup sequence logging

### 6.7. Frontend SSE Error Handling Improvements
- **Files**: `/extensions/voice-assistant/assets/voice-assistant-integration.js` and `/extensions/voice-assistant/assets/voice-assistant.js`
- **Details**:
  - **Current Status**: Basic SSE implementation with error handling deficiencies
  - **Technical Approach**: Enhance error detection, user feedback, and reconnection logic
- **Tasks**:
  - 🔄 Fix EventSource URL formatting and connection issues
    - 🔄 Correct SSE URL parameter format (`?stream=true&shop=` instead of concatenation)
    - 🔄 Update references to endpoint variables in all files
    - 🔄 Fix duplicate event listeners for 'open' events
    - 🔄 Implement proper session ID tracking across reconnects
  - 🔄 Enhance error detection for SSE connections
    - 🔄 Properly handle various readyState values (0=connecting, 1=open, 2=closed)
    - 🔄 Improve error handling for missing or undefined event.data
    - 🔄 Add proper error classification for network vs. server errors
    - 🔄 Implement more robust error event parsing
  - 🔄 Improve reconnection logic
    - 🔄 Implement exponential backoff with jitter
    - 🔄 Add max retry limits with proper user feedback
    - 🔄 Preserve session context during reconnects when possible
    - 🔄 Add recovery state to resume interrupted voice sessions
  - 🔄 Enhance user feedback during connection issues
    - 🔄 Add visual indicators for connection state
    - 🔄 Provide meaningful error messages based on error type
    - 🔄 Update UI elements to reflect connection status
    - 🔄 Add retry button for manual reconnection attempts
  - 🔄 Implement browser compatibility improvements
    - 🔄 Add EventSource polyfill for older browsers
    - 🔄 Test in major browsers (Chrome, Firefox, Safari, Edge)
    - 🔄 Add fallback mechanism for browsers without SSE support
    - 🔄 Create graceful degradation for limited browser environments

## 7. Testing & Deployment

### 7.1. Local Testing
- **Details**:
  - **Approach**: Implement a systematic testing strategy for component and end-to-end testing.
  - **Current Status**: Ad-hoc testing in place, needs formalization.
- **Tasks**:
  - 🔄 Test SSE connection using browser debugging tools
    - 🔄 Verify proper connection establishment
    - 🔄 Test message receipt and processing
    - 🔄 Check connection maintenance
    - 🔄 Validate reconnection behavior
  - 🔄 Verify audio processing with test recordings
    - 🔄 Create test audio samples
    - 🔄 Verify processing pipeline
    - 🔄 Test different audio conditions
    - 🔄 Validate noise handling
  - 🔄 Check response latency and optimize if needed
    - 🔄 Measure end-to-end response time
    - 🔄 Identify bottlenecks
    - 🔄 Implement optimizations
    - 🔄 Create performance benchmarks
  - 🔄 Test across different browsers and devices
    - 🔄 Create browser compatibility matrix
    - 🔄 Test on mobile devices
    - 🔄 Verify tablet experience
    - 🔄 Create browser-specific workarounds if needed

### 7.2. Shopify App Configuration
- **File**: `/shopify.app.toml`
- **Details**:
  - **Current Status**: Basic configuration in place, needs verification for production.
- **Tasks**:
  - ✅ Configure correct App Proxy subpath and prefix
    - ✅ Set proxy path for API endpoints
    - ✅ Configure prefix for Shopify routing
  - 🔄 Verify proxy URL points to production server
    - 🔄 Update URL for production environment
    - 🔄 Test proxy functionality
    - 🔄 Verify cross-domain communication
  - 🔄 Set up proper CORS configuration
    - 🔄 Configure allowed origins
    - 🔄 Set up method restrictions
    - 🔄 Add proper header handling
    - 🔄 Test CORS functionality

### 7.3. Production Deployment
- **Details**:
  - **Approach**: Create a robust deployment process with proper monitoring and failover.
  - **Current Status**: Not started.
- **Tasks**:
  - ❌ Deploy updates to production environment
    - ❌ Create deployment checklist
    - ❌ Implement staged rollout
    - ❌ Set up version control tagging
    - ❌ Create rollback procedures
  - ❌ Configure proper SSL certificates
    - ❌ Generate and install SSL certificates
    - ❌ Set up auto-renewal
    - ❌ Configure secure headers
    - ❌ Test SSL configuration
  - ❌ Set up monitoring for connection issues
    - ❌ Implement health check endpoints
    - ❌ Create monitoring dashboard
    - ❌ Set up alerts for critical issues
    - ❌ Implement performance monitoring
  - ❌ Implement logging for troubleshooting
    - ❌ Create centralized logging
    - ❌ Implement log rotation
    - ❌ Add structured logging format
    - ❌ Create log analysis tools

## 8. Current Status and Next Steps

### 8.1. Completed Tasks
- ✅ Initial WebRTC audio integration 
- ✅ Audio capture and processing in browser
- ✅ Audio proxy server configuration
- ✅ Basic Replicate API integration
- ✅ Voice assistant UI components and visualization
- ✅ CORS configuration for cross-origin requests
- ✅ Basic participant tracking and session management
- ✅ Audio parameter optimization for speech recognition
- ✅ Visualization based on actual audio levels
- ✅ SSE implementation for streaming responses
- ✅ HTTP POST audio data transmission
- ✅ Comprehensive error handling and retry logic
- ✅ Chunked audio transmission with sequence tracking
- ✅ WebSocket code removal from backend and frontend

### 8.2. In Progress (Prioritized)
1. ✅ Converting WebSocket to SSE for response streaming
   - ✅ Implemented SSE headers and connection handling
   - ✅ Implemented client-side EventSource integration
   - ✅ Added support for progressive response chunks
   - 🔄 Need to test in various network conditions

2. ✅ Implementing HTTP POST for audio data transmission
   - ✅ Implemented complete POST endpoint
   - ✅ Added chunking and sequence tracking
   - ✅ Added retry logic and error handling
   - ✅ Implemented request cancellation and timeouts

3. 🔄 Enhancing error handling and recovery mechanisms
   - ✅ Implemented standardized error codes and response format
   - ✅ Created user-friendly error messages
   - 🔄 Working on fallback mechanisms
   - 🔄 Need to add more comprehensive recovery strategies

4. 🔄 Creating streaming response processing
   - ✅ Implemented event-based response handling
   - ✅ Set up progressive UI updates
   - 🔄 Need to test streaming responses with real Ultravox API

### 8.3. Next Critical Steps (Priority Order with Detailed Sub-tasks)

**--- NEW: Refactor to Direct LiveKit Connection ---**

**Objective:** Replace the unreliable SSE-over-Proxy connection with a standard, direct WebSocket/WebRTC connection to LiveKit, managed by the LiveKit client SDK.

**1. Backend: Create LiveKit Token Endpoint** `[ ]`
   - **File:** `app/routes/api.livekit.token.ts` (New)
   - **Tasks:**
     - `[ ]` Create new Remix loader function.
     - `[ ]` Add authentication (e.g., check session cookie).
     - `[ ]` Read `LIVEKIT_URL`, `LIVEKIT_KEY`, `LIVEKIT_SECRET` from `process.env`.
     - `[ ]` Install `livekit-server-sdk` if not already present (`npm install livekit-server-sdk`).
     - `[ ]` Import `AccessToken` from `livekit-server-sdk`.
     - `[ ]` Instantiate `AccessToken` with API key/secret.
     - `[ ]` Define room name strategy (e.g., `room-${shopDomain}`).
     - `[ ]` Define participant identity strategy (e.g., `user-${uniqueId}`).
     - `[ ]` Set token permissions (e.g., `canPublish`, `canSubscribe`).
     - `[ ]` Generate JWT using `token.toJwt()`.
     - `[ ]` Return `{ livekitUrl: process.env.LIVEKIT_URL, token: jwt }` as JSON.
     - `[ ]` Add appropriate CORS headers (allow storefront origin).

**2. Frontend: Refactor Connection Logic** `[ ]`
   - **File:** `extensions/voice-assistant/assets/voice-assistant-integration.js` (or similar)
   - **Tasks:**
     - `[ ]` Remove `connectSSE` function and `EventSource` usage.
     - `[ ]` Remove code related to `/apps/voice?stream=true` endpoint.
     - `[ ]` Add new function (e.g., `connectLiveKit`) to:
       - `[ ]` Fetch token/URL from `/api/livekit/token` endpoint.
       - `[ ]` Handle errors during fetch.
       - `[ ]` Import `Room`, `RoomEvent`, etc. from `livekit-client`.
       - `[ ]` Instantiate `new Room(...)`.
       - `[ ]` Call `await room.connect(livekitUrl, token)`.
       - `[ ]` Store the `room` instance.
     - `[ ]` Modify audio sending logic (`startAudio` / audio loop):
       - `[ ]` Ensure `room.localParticipant` exists after connection.
       - `[ ]` Use `room.localParticipant.publishTrack(localAudioTrack)` instead of POSTing chunks.
       - `[ ]` Add `room.on(...)` listeners:
         - `[ ]` `RoomEvent.TrackSubscribed`: Handle incoming audio tracks (e.g., TTS).
         - `[ ]` `RoomEvent.DataReceived`: Handle text/control messages if used.
         - `[ ]` `RoomEvent.ConnectionStateChanged`: Update UI based on connection status (Connecting, Connected, Disconnected, Reconnecting).
         - `[ ]` `RoomEvent.Disconnected`: Handle cleanup and potential reconnection UI.
       - `[ ]` Update `stopListening` to call `room.disconnect()` and cleanup LiveKit resources.
     - `[ ]` Update `startAudio` to use `room.localParticipant.publishTrack(localAudioTrack)` instead of POSTing chunks.

**3. Backend: Refactor/Remove Proxy Route & Server** `[ ]`
   - **File:** `/app/routes/proxy.voice.tsx`
   - **Tasks:**
     - `[ ]` Remove loader logic related to forwarding SSE (`isSSE` check).
     - `[ ]` Remove action logic related to forwarding POSTed audio chunks.
     - `[ ]` Evaluate if the route is still needed for any *other* App Proxy actions; if not, potentially delete the file.
   - **File:** `/app/livekit-proxy.server.js`
   - **Tasks:**
     - `[ ]` Analyze purpose: Is it *only* for proxying/SSE/Replicate interaction?
       - **Decision Point:**
         - `[ ]` **Option A (Webhook):** Remove this server. Implement Replicate logic in Remix backend triggered by LiveKit webhooks.
         - `[ ]` **Option B (Bot Participant):** Refactor this server to connect to LiveKit using SDK, subscribe to tracks, interact with Replicate, and send results back via LiveKit.
         - `[ ]` **Option C (Backend Logic):** Remove this server. Implement Replicate logic directly in Remix backend (triggered by webhook or similar). **(Choose one based on analysis)**
     - `[ ]` Update/remove associated Docker configurations (`Dockerfile.livekit-proxy`, docker-compose entries).
     - `[ ]` Remove associated start scripts (`start:livekit-proxy`, `test:livekit-connection`).

**4. Server-Side: Handle Audio Processing** `[ ]`
   - **Tasks:** (Depends on Option chosen in Step 3)
     - `[ ]` **If Webhook:**
       - `[ ]` Create new Remix endpoint(s) to receive LiveKit webhooks (e.g., `track_published`).
       - `[ ]` Implement webhook authentication.
       - `[ ]` Add logic to fetch/process audio track data (e.g., using Egress or Bot participant).
       - `[ ]` Add logic to interact with Replicate API.
     - `[ ]` **If Bot Participant:**
       - `[ ]` Refactor `livekit-proxy.server.js` (or new service) using `livekit-server-sdk` / `livekit-client`.
       - `[ ]` Implement logic to join rooms, subscribe to tracks.
       - `[ ]` Implement Replicate API interaction.
       - `[ ]` Implement logic to send results back (Data messages, publishing TTS track).
       - `[ ]` **If Backend Logic:**
         - `[ ]` Add Replicate interaction logic to the main Remix backend.
         - `[ ]` Determine trigger mechanism (e.g., webhook).

**--- End Refactor Section ---**


**OLD Tasks (Obsolete/Superseded by Refactor):**

1.  **Fix Shopify App Proxy SSE Connection Issues** `[-]` (CRITICAL PRIORITY - OBSOLETE)
    *   Implement enhanced diagnostics `[-]`
    *   Fix server-side path handling in livekit-proxy.server.js `[-]`
    *   Fix client-side URL formation in voice-assistant-integration.js `[-]`
    *   Fix SSE implementation issues `[-]`

2.  **Improve Error Handling and Connection Recovery** `[~]` (HIGH PRIORITY - Partially relevant, adapt for LiveKit SDK)
    *   Server-side error improvements `[~]` (Focus on token endpoint)
    *   Client-side error handling `[~]` (Focus on LiveKit SDK events/errors)

3.  **Test and Debug SSE Implementation** `[-]` (HIGH PRIORITY - OBSOLETE)
    *   Test component functionality `[-]`
    *   Test end-to-end flow `[-]`

(... keep other existing tasks like Tool Calling, TTS, Production Prep, updating priorities as needed ...)

## 9. Data Flow Summary (Revised Architecture)

1. **Voice Capture**:
   - Browser captures audio via WebRTC getUserMedia API
   - Audio is processed for optimal quality (noise reduction, etc.)
   - Audio chunks are encoded as base64

2. **Data Transmission**:
   - Client establishes SSE connection via `/apps/voice?stream=true&shop=[shop_domain]`
   - Server assigns a unique session ID for the connection
   - Audio chunks sent via HTTP POST to `/apps/voice` with session ID and request ID
   - Each chunk includes sequence number for tracking
   - Server buffers and forwards audio to backend for processing

3. **Processing**:
   - Server accumulates audio chunks until sufficient for processing
   - Buffered audio sent to Replicate API (Ultravox model)
   - AI processes audio and generates progressive response
   - Response may include tool calls (product search, navigation)
   - Tool calls executed as they arrive (asynchronously)

4. **Response Delivery**:
   - Server streams response via SSE events to client in real-time
   - Different event types used for different response parts:
     - 'message' for status updates
     - 'result' for assistant responses
     - 'error' for error messages
     - 'heartbeat' to keep connection alive
   - Client receives and processes event stream
   - UI updates progressively as response chunks arrive
   - Text-to-speech plays audio response if enabled
   - Navigation or search actions executed based on tool calls

## 10. Build Log

### 2025-03-22
- Reviewed SSE implementation and identified frontend and backend issues
- Found Docker LiveKit container is missing HTTP POST and SSE support
- Discovered backend lacks support for session ID and chunk sequence numbers
- Added critical backend update tasks to implementation plan
- Added detailed error handling improvement tasks for frontend
- Discovered URL formatting issues in SSE connection logic
- Identified potential race conditions in event handling
- Created comprehensive frontend error handling subplan
- Prioritized backend and frontend fixes as critical priorities

### 2025-03-21
- Completed initial SSE implementation for streaming responses
- Replaced WebSocket audio sending with HTTP POST
- Implemented proper event typing for SSE messages
- Added timeout logic and request cancellation
- Implemented chunked audio transmission with sequence tracking
- Added initial error handling mechanisms
- Updated implementation plan to reflect completed tasks

### 2025-03-20
- Updated implementation plan with detailed subtasks
- Reorganized priority tasks based on current progress
- Added detailed technical approaches for each component
- Created comprehensive subtask breakdowns for error handling
- Updated status indicators for all tasks

### 2025-03-19
- Fixed ES module compatibility issues in LiveKit proxy
- Implemented audio buffer management for optimal processing
- Updated proxy route handler with better error handling
- Added CORS support for cross-origin requests
- Improved participant tracking in WebSocket connections