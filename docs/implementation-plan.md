# Voice Assistant Implementation Plan for Shopify (Hybrid Approach - Option C with Play.ht TTS)

## Overview
The Voice AI Shopping Assistant is a Shopify app enhancing the shopping experience with voice interaction. It features a frontend theme extension (voice button, info window) and a backend using LiveKit for real-time audio, Replicate/Ultravox for NLU/Tool-Calling, and Play.ht for Text-to-Speech (TTS). This plan details the architecture.

## 1. Architecture & Core Components

### 1.1. Core Components
- **Shopify App Backend**: Remix framework; handles configuration, LiveKit token generation, and Tool Execution.
- **Theme Extension**: Frontend voice assistant interface for shoppers
- **LiveKit Server**: Handles real-time audio transport (WebRTC).
- **Bot Participant Service**: Backend service using LiveKit Server SDK; joins rooms, processes audio, interacts with AI APIs, publishes TTS.
- **AI Model (NLU/Tools)**: Ultravox via Replicate API.
- **AI Model (TTS)**: Play.ht via Standard API.
- **Tool Framework**: System for executing product searches and UI actions based on user intent

### 1.2. Data Flow (Revised for Hybrid Approach)
1. Shopper activates the voice assistant button.
2. Frontend requests a LiveKit token from the Remix Backend.
3. Frontend connects directly to LiveKit Server using the token and LiveKit Client SDK.
4. Frontend captures audio and publishes it as a track to the LiveKit room.
5. **Bot Participant Service** joins the room and subscribes to the user's audio track.
6. Bot Service buffers/processes audio and sends it to **Replicate API (Ultravox)** for NLU.
7. Ultravox processes audio and returns NLU results (text response, tool calls) to the Bot Service.
8. Bot Service triggers **Tool Execution Engine** (in Remix Backend) if tool calls are present.
9. Bot Service sends the text response from Ultravox to **Play.ht Standard API** for TTS synthesis.
10. Play.ht returns synthesized audio stream/data to the Bot Service.
11. Bot Service **publishes the received TTS audio as a new track** to the LiveKit room.
12. Frontend (already subscribed) receives the Bot's TTS track and plays the audio response.
13. Frontend updates UI based on tool execution results (potentially received via LiveKit Data Channel from the Backend or inferred from actions).

## 2. Server-Side Implementation (Hybrid Approach)

### 2.1. Backend: LiveKit Token Endpoint `[ ]`
- **File**: `/app/routes/api.livekit.token.ts` (New)
- **Purpose**: Securely generates LiveKit JWT tokens for frontend clients.
- **Tasks**:
  - `[x]` Create new Remix loader function.
  - `[~]` Add authentication (verify Shopify session). (Current: uses query param; needs review)
  - `[x]` Read LiveKit credentials (`LIVEKIT_URL`, `LIVEKIT_KEY`, `LIVEKIT_SECRET`) from `process.env`.
  - `[x]` Install `livekit-server-sdk`.
  - `[x]` Import `AccessToken` from `livekit-server-sdk`.
  - `[x]` Instantiate `AccessToken`.
  - `[x]` Define room name strategy (e.g., `room-${shopDomain}`).
  - `[x]` Define participant identity strategy (e.g., `user-${uniqueId}`).
  - `[x]` Set appropriate token permissions (`canPublish: true`, `canSubscribe: true`).
  - `[x]` Generate JWT using `token.toJwt()`.
  - `[x]` Return `{ livekitUrl: process.env.LIVEKIT_URL, token: jwt }` as JSON.
  - `[x]` Implement CORS headers to allow requests from the storefront origin.

### 2.2. Bot Participant Service `[ ]`
- **File**: `/app/bot-participant.service.ts` (New or refactored from `livekit-proxy.server.js`)
- **Purpose**: Connects to LiveKit rooms, processes user audio, interacts with NLU (Replicate) and TTS (Play.ht) APIs, and publishes TTS audio back to the room.
- **Tasks**:
  - `[ ]` Implement service using `livekit-server-sdk` (Node.js).
  - `[ ]` Connect to LiveKit server using API key/secret.
  - `[ ]` Implement logic to join relevant rooms (triggered by webhook or other mechanism).
  - `[ ]` Subscribe to user audio tracks (`RoomEvent.TrackSubscribed`).
  - `[ ]` Buffer/process received audio data (e.g., format conversion if needed).
  - `[ ]` Integrate with Replicate API (Ultravox) for NLU.
  - `[ ]` Integrate with Play.ht Standard API for TTS.
  - `[ ]` Publish received TTS audio as a new track to the LiveKit room.
  - `[ ]` Handle tool call triggers (e.g., send request to Remix backend Tool Execution Engine).
  - `[ ]` Manage service lifecycle, error handling, and reconnection.

### 2.3. Backend: Tool Execution Engine `[ ]`
- **File**: `/app/routes/api.tool.execute.ts` (New, or integrated into existing backend logic)
- **Purpose**: Executes actions requested by the NLU model (via the Bot Service).
- **Tasks**:
  - `[ ]` Create endpoint(s) to receive tool execution requests from Bot Service.
  - `[ ]` Implement authentication/authorization for tool requests.
  - `[ ]` Implement logic for `searchProducts` tool using Shopify Storefront API.
  - `[ ]` Implement logic for other potential tools (e.g., navigation, UI updates).
  - `[ ]` Format tool execution results.
  - `[ ]` Determine mechanism to send results back to frontend (e.g., via LiveKit Data Channel initiated by backend, or relayed through Bot Service).

## 3. Client-Side Implementation (Hybrid Approach)

### 3.1. Frontend: LiveKit Connection & Audio Handling
- **File**: `/extensions/voice-assistant/assets/voice-assistant-integration.js`
- **Tasks**:
  - `[x]` Implement function to fetch LiveKit token from `/api/livekit/token`.
  - `[x]` Use `livekit-client` SDK to connect to LiveKit server (`room.connect`).
  - `[x]` Handle LiveKit connection states (`RoomEvent.ConnectionStateChanged`) for UI feedback.
  - `[x]` Implement high-quality audio capture (`getUserMedia` with 16kHz, mono, noise suppression). (via `createLocalAudioTrack`)
  - `[x]` Publish local audio track to LiveKit room (`room.localParticipant.publishTrack`).
  - `[x]` Subscribe to remote audio tracks (`RoomEvent.TrackSubscribed`), specifically the TTS track from the Bot Participant.
  - `[x]` Handle playback of subscribed TTS audio tracks.
  - `[x]` Implement LiveKit disconnection logic (`room.disconnect`).
  - `[x]` Provide audio level data (from local track) for UI visualization.
  - `[x]` Remove old SSE/POST connection and audio sending logic.

### 3.2. Frontend: Voice Assistant Interface Updates
- **File**: `/extensions/voice-assistant/assets/voice-assistant.js`
- **Tasks**:
  - `[ ]` Update UI state management to reflect LiveKit connection states (Connecting, Connected, Disconnected, Reconnecting).
  - `[ ]` Ensure responsive visualization works with audio levels from the local LiveKit track.
  - `[ ]` Implement playback controls for received TTS audio tracks (if needed beyond auto-play).
  - `[ ]` Handle errors reported via LiveKit connection state or potentially via Data Channels.
  - `[ ]` Update UI based on tool execution results (potentially received via LiveKit Data Channel).
  - `[ ]` Ensure proper cleanup of LiveKit-related resources and listeners on component destruction.
  - `[ ]` Remove UI elements/logic related to SSE/POST connections.
  - `[ ]` Remove client-side TTS implementation (Web Speech API) as TTS is now handled server-side via Bot and Play.ht.

### 3.3. Frontend: App Block Configuration
- **File**: `/extensions/voice-assistant/blocks/voice-assistant.liquid`
- **Tasks**:
  - `[ ]` Ensure scripts (`livekit-client`, `voice-assistant-integration.js`, `voice-assistant.js`) are loaded correctly.
  - `[ ]` Verify HTML structure supports the updated UI states and components.
  - `[ ]` Update any Liquid variables or settings if needed for the new connection method.

## 4. AI Model Integration

### 4.1. Ultravox Model Integration
- **Interaction Point**: Bot Participant Service
- **Tasks**:
  - `[ ]` Set up Replicate account and API access within Bot Service.
  - `[ ]` Configure Ultravox model parameters (version, input settings).
  - `[ ]` Implement audio data preparation (format, context) in Bot Service before sending to Replicate.
  - `[ ]` Implement request/response handling with Replicate API (including streaming if applicable).
  - `[ ]` Parse NLU results (text, tool calls) received by Bot Service.
  - `[ ]` Trigger Tool Execution based on parsed results.

### 4.2. Play.ht TTS Integration
- **Interaction Point**: Bot Participant Service
- **Tasks**:
  - `[ ]` Set up Play.ht account and API access within Bot Service.
  - `[ ]` Choose Play.ht API (Standard API recommended for streaming/control).
  - `[ ]` Configure TTS parameters (voice ID, quality, speed).
  - `[ ]` Implement logic in Bot Service to send text (from Ultravox) to Play.ht API.
  - `[ ]` Handle synthesized audio stream/data returned from Play.ht.
  - `[ ]` Implement logic in Bot Service to publish received TTS audio as a LiveKit track.

### 4.3. Environment Configuration
- **File**: `/.env` and `/.env.example`
- **Tasks**:
  - `[ ]` Add Replicate API key configuration (`REPLICATE_API_TOKEN`).
  - `[ ]` Configure Ultravox model version (`ULTRAVOX_MODEL_VERSION`).
  - `[ ]` Add Play.ht User ID and Secret Key (`PLAYHT_USER_ID`, `PLAYHT_SECRET_KEY`).
  - `[ ]` Add LiveKit Server connection details (`LIVEKIT_URL`, `LIVEKIT_KEY`, `LIVEKIT_SECRET`).
  - `[ ]` Ensure secure storage and access for all keys.
  - `[ ]` Update documentation for all required environment variables.
  - `[ ]` Remove obsolete variables (e.g., `LIVEKIT_PROXY_URL` if the proxy server is removed).

## 5. Tool Calling Framework

### 5.1. Define Tool Schema
- **Location**: Shared definition or within Bot Service / Remix Backend
- **Tasks**:
  - `[ ]` Define JSON schema for each tool (e.g., `searchProducts`, `navigateToPage`, `displayMessage`).
  - `[ ]` Ensure schemas are compatible with Ultravox tool calling format.
  - `[ ]` Define parameters for each tool (e.g., search query, filters, URL, message content).

### 5.2. Implement Tool Execution Engine
- **Location**: Remix Backend (triggered by Bot Service)
- **Tasks**:
  - `[ ]` Create endpoint(s) in Remix backend to handle tool execution requests from Bot Service.
  - `[ ]` Implement product search logic using Shopify Storefront API (GraphQL).
  - `[ ]` Implement logic for other tools (e.g., navigation hints, UI updates).
  - `[ ]` Format tool execution results.
  - `[ ]` Send results back to the frontend (e.g., via LiveKit Data Channel from Backend, or relayed through Bot Service).

## 6. MVP Features to Implement (Hybrid Approach)

### 6.1. LiveKit Connection (Frontend & Backend) `[x]` (HIGHEST PRIORITY)
- **Files**: `/app/routes/api.livekit.token.ts`, `/extensions/voice-assistant/assets/voice-assistant-integration.js`
- **Tasks**:
  - `[x]` Implement LiveKit token generation endpoint in Remix backend.
  - `[x]` Implement frontend logic to fetch token and connect to LiveKit server using `livekit-client`.
  - `[x]` Handle connection states and errors robustly on the frontend.
  - `[x]` Implement audio track publishing from frontend to LiveKit.

### 6.2. Bot Participant Service `[x]` (HIGH PRIORITY) - Refactored into `app/bot/`
- **Files**: `/app/bot/livekit.service.ts`, `/app/bot/audio.processor.ts`, `/app/bot/nlu.service.ts`, `/app/bot/bot.orchestrator.ts`, `/app/bot/index.ts` (New)
- **Tasks**:
  - `[x]` Set up basic service structure using `@livekit/rtc-node` (`livekit.service.ts`).
  - `[x]` Implement logic to join LiveKit rooms based on triggers (`livekit.service.ts`, `bot.orchestrator.ts`).
  - `[x]` Subscribe to user audio tracks (`livekit.service.ts`).
  - `[x]` Implement basic audio buffering (`audio.processor.ts`).

### 6.3. NLU Integration (Replicate/Ultravox) `[x]`
- **Files**: `/app/bot/nlu.service.ts`, `/app/bot/bot.orchestrator.ts`
- **Tasks**:
  - `[x]` Integrate Replicate API client into Bot Service (`nlu.service.ts`).
  - `[x]` Send buffered audio to Ultravox (`nlu.service.ts`, triggered by `audio.processor.ts` via `bot.orchestrator.ts`). (Includes placeholder WAV encoding)
  - `[x]` Parse NLU response (text and basic tool calls). (Basic parsing implemented, structure TBD)

### 6.4. TTS Integration (Play.ht) `[x]`
- **Rationale**: Chosen for its specific partnership with LiveKit, aiming for optimized low-latency (<300ms TTFA) real-time TTS crucial for conversational AI, as detailed in their joint announcement. Leverages LiveKit's infrastructure for potentially more reliable audio delivery compared to generic TTS models.
- **Files**: `/app/bot/tts.service.ts`, `/app/bot/bot.orchestrator.ts`
- **Tasks**:
  - `[x]` Integrate Play.ht Standard API client into Bot Service.
  - `[x]` Implement authentication using Play.ht User ID and Secret Key.
  - `[x]` Configure API requests for low latency (e.g., selecting appropriate voice models like "Dialog", specifying quality settings).
  - `[x]` Send text response from NLU to Play.ht API for synthesis.
  - `[x]` Implement handling for Play.ht's audio stream response (preferred for low latency) or chunked audio data.
  - `[x]` Implement logic in Bot Service to buffer/process the received TTS audio stream/chunks.
  - `[x]` Publish the processed TTS audio as a new audio track to the LiveKit room using the Bot participant.
  - `[x]` Add error handling for Play.ht API calls (timeouts, invalid requests, etc.).

### 6.5. Frontend TTS Playback `[x]`
- **Files**: `/extensions/voice-assistant/assets/voice-assistant-integration.js`, `/extensions/voice-assistant/assets/voice-assistant.js`
- **Tasks**:
  - `[x]` Implement logic to subscribe to and play the Bot's TTS audio track.
  - `[x]` Update UI state to indicate when the assistant is "speaking".

### 6.6. Basic Tool Execution (Product Search) `[ ]`
- **Files**: `/app/routes/api.tool.execute.ts` (New), `/app/bot-participant.service.ts`
- **Tasks**:
  - `[ ]` Define schema for `searchProducts` tool.
  - `[ ]` Implement trigger in Bot Service to call Remix backend endpoint for tool execution.
  - `[ ]` Implement Remix endpoint to handle `searchProducts` request.
  - `[ ]` Integrate with Shopify Storefront API (GraphQL) for basic product search.
  - `[ ]` Send results back (e.g., via LiveKit Data Channel or have Bot Service announce results via TTS).

### 6.7. Remove Obsolete Code `[~]`
- **Files**: `/app/routes/proxy.tsx`, `/app/livekit-proxy.server.js`, `/extensions/voice-assistant/assets/*`
- **Tasks**:
  - `[ ]` Remove all SSE connection logic from frontend and backend.
  - `[ ]` Remove all HTTP POST audio sending logic from frontend.
  - `[ ]` Remove or significantly refactor `/app/routes/proxy.tsx` if no longer needed for App Proxy.
  - `[x]` Replace `/app/livekit-proxy.server.js` with new Bot Service architecture.
  - `[ ]` Remove client-side TTS (Web Speech API) code.

## 7. Testing & Deployment (Hybrid Approach)

### 7.1. Local Testing
- **Details**: Focus on testing the direct LiveKit connection, Bot interaction, and AI API integrations, paying close attention to latency.
- **Tasks**:
  - `[ ]` Test LiveKit connection establishment and stability (WebRTC).
  - `[ ]` Verify audio publishing from frontend and subscription by Bot Service.
  - `[ ]` Test NLU processing via Replicate (latency, accuracy).
  - `[ ]` **Test TTS synthesis via Play.ht:**
    - `[ ]` Verify successful audio generation and publishing back to LiveKit by Bot Service.
    - `[ ]` **Measure end-to-end TTS latency** (from text sent to Play.ht to audio playback start on frontend) - target <300ms TTFA if possible.
    - `[ ]` Verify quality and clarity of Play.ht synthesized audio.
  - `[ ]` Verify frontend playback of TTS audio track.
  - `[ ]` Test basic tool execution flow (product search).
  - `[ ]` Check overall response latency and identify bottlenecks in the new pipeline (NLU + TTS + Tool Execution).
  - `[ ]` Test across different browsers and devices.

### 7.2. Shopify App Configuration
- **File**: `/shopify.app.toml`
- **Details**: Ensure configuration supports the new backend endpoints (token, tool execution) if needed via App Proxy, or direct calls if authenticated.
- **Tasks**:
  - `[ ]` Review `app_proxy` settings; remove if `/apps/voice` is no longer used.
  - `[ ]` Ensure CORS is correctly configured for the `/api/livekit/token` endpoint.
  - `[ ]` Verify authentication for backend API endpoints.

### 7.3. Production Deployment
- **Details**: Deploy Remix backend, Bot Participant Service, and ensure LiveKit server is configured.
- **Tasks**:
  - `[ ]` Create deployment strategy for Remix backend and Bot Service (e.g., separate containers/services).
  - `[ ]` Configure production environment variables for all services (LiveKit, Replicate, Play.ht, Shopify).
  - `[ ]` Set up monitoring for LiveKit connection health, Bot Service status, and API interactions.
  - `[ ]` Implement robust logging across all components.
  - `[ ]` Configure SSL certificates for all public-facing endpoints.

## 8. Current Status and Next Steps (Hybrid Approach)

### 8.1. Completed Tasks (Hybrid Architecture)
- ✅ LiveKit Token Endpoint and Connection Flow
- ✅ Bot Service Architecture (LiveKit, Audio Processing, NLU, TTS)
- ✅ Replicate/Ultravox NLU Integration
- ✅ Play.ht TTS Integration
- ✅ TTS Audio Publishing to LiveKit Room
- ✅ Docker/Deployment Configuration
- ✅ Frontend TTS Audio Subscription and Playback

### 8.2. In Progress 
1. `[ ]` **Tool Execution Framework:** Implement basic product search capability.
2. `[ ]` **Cleanup Legacy Code:** Remove obsolete SSE and HTTP POST logic.
3. `[ ]` **Testing:** Thoroughly test the end-to-end flow.

### 8.3. Next Critical Steps
1. **Comprehensive Testing:** Test the entire flow from audio capture to TTS response.
2. **Tool Framework Implementation:** Complete the basic product search capability.
3. **Code Cleanup:** Remove all obsolete code related to the previous architecture.
4. **Production Deployment:** Configure and deploy to production with proper monitoring.

## 9. Data Flow Summary (Hybrid Architecture)

1.  **Activation & Token:** User activates -> Frontend requests token from Remix Backend -> Backend returns LiveKit URL & Token.
2.  **LiveKit Connection:** Frontend connects to LiveKit Server using Token & SDK.
3.  **Audio Publishing:** Frontend captures audio -> Publishes audio track to LiveKit Room.
4.  **Bot Subscription:** Bot Participant Service joins room -> Subscribes to user's audio track.
5.  **NLU Processing:** Bot Service sends audio to Replicate/Ultravox -> Receives text/tool calls.
6.  **Tool Execution (if needed):** Bot Service triggers Remix Backend endpoint -> Backend executes tool (e.g., Shopify API call) -> Backend sends results (e.g., via LiveKit Data Channel).
7.  **TTS Synthesis:** Bot Service sends text response to Play.ht -> Receives TTS audio stream/data.
8.  **TTS Publishing:** Bot Service publishes TTS audio as a new track to LiveKit Room.
9.  **Frontend Playback:** Frontend subscribes to Bot's TTS track -> Plays audio response.
10. **UI Update:** Frontend updates UI based on TTS state and tool results (from Data Channel).

## 10. Build Log

### 2025-04-03 (Hybrid Plan Update)
- Refactored implementation plan (Sections 6-10) to align with the Hybrid Architecture (Option C) using LiveKit direct connection, Bot Participant Service, and Play.ht TTS.
- Updated MVP features, testing, deployment, status, and data flow sections.
- Marked old SSE/POST related tasks and sections as obsolete or needing rework.
- Prioritized tasks for the Hybrid MVP.

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