# Voice AI Shopping Assistant - System Architecture

## System Overview

The Voice AI Shopping Assistant is built on a modern, scalable architecture that integrates with the Shopify platform and leverages the Ultravox model through Replicate's API for voice processing and tool calling. This document outlines the key components of the system and how they interact.

## Architecture Diagram

```mermaid
graph TD
    subgraph Frontend (Browser)
        FE_UI[Voice Assistant UI]
        FE_LK_SDK[LiveKit Client SDK]
        FE_AudioCap[WebAudio Capture]
        FE_TTS_Play[TTS Playback]

        FE_UI -- Activate --> FE_AudioCap;
        FE_AudioCap -- Audio Stream --> FE_LK_SDK;
        FE_LK_SDK -- Publishes User Audio Track --> LK_Server;
        LK_Server -- Subscribes Bot TTS Track --> FE_LK_SDK;
        FE_LK_SDK -- TTS Audio Stream --> FE_TTS_Play;
        FE_TTS_Play -- Playback --> FE_UI;
        FE_LK_SDK -- Connection Mgmt --> FE_UI;
    end

    subgraph Backend (Remix App + Services)
        BE_Token[LiveKit Token Endpoint]
        BE_Bot[Bot Participant Service]
        BE_ToolExec[Tool Execution Engine]

        FE_UI -- Request Token --> BE_Token;
        BE_Token -- Token/URL --> FE_UI;

        BE_Bot -- Joins Room --> LK_Server;
        LK_Server -- User Audio Track --> BE_Bot;
        BE_Bot -- Audio Data --> Rep_API;
        Rep_API -- NLU/Tool/Text --> BE_Bot;
        BE_Bot -- Tool Call Info --> BE_ToolExec;
        BE_ToolExec -- Executes --> Shopify_API[Shopify API];
        BE_Bot -- Text for TTS --> PlayHT_API;
        PlayHT_API -- TTS Audio Data/Stream --> BE_Bot;
        BE_Bot -- Publishes TTS Audio Track --> LK_Server;
    end

    subgraph External Services
        LK_Server[LiveKit Server]
        Rep_API[Replicate API / Ultravox]
        PlayHT_API[Play.ht Standard API]
    end

    style Rep_API fill:#f9f,stroke:#333,stroke-width:2px;
    style PlayHT_API fill:#ccf,stroke:#333,stroke-width:2px;
    style BE_Bot fill:#dff,stroke:#333,stroke-width:2px;
```

**Diagram Description:**

The diagram illustrates the **Hybrid Approach (Option C)** flow:
1. The Shopper interacts with the Voice UI in the Theme App Extension.
2. The frontend requests a LiveKit token from the Shopify App Backend (Remix).
3. The frontend connects directly to the LiveKit Server using the LiveKit Client SDK and publishes the user's audio track.
4. A **Bot Participant Service** (backend) joins the LiveKit room, subscribes to the user's audio track.
5. The Bot Service sends the audio to the **Replicate API (Ultravox)** for NLU and Tool Calling.
6. Replicate returns text response and tool calls to the Bot Service.
7. The Bot Service (or main backend) triggers the **Tool Execution Engine** based on tool calls.
8. The Bot Service sends the text response to the **Play.ht Standard API** for TTS.
9. Play.ht returns synthesized audio to the Bot Service.
10. The Bot Service publishes the TTS audio as a **new track** to the LiveKit room.
11. The Frontend subscribes to the Bot's TTS track via the LiveKit Client SDK and plays the audio.

## Component Descriptions

### 1. Shopify Integration Components

#### 1.1 Shopify Admin Interface
- **App Settings & Configuration**: React-based interface built using Shopify App Bridge and Polaris components
- **Purpose**: Allows merchants to configure the voice assistant, customize appearance, and view analytics
- **Technologies**: React, Remix, Shopify App Bridge, Polaris UI components

#### 1.2 Theme App Extension
- **Voice UI Components**: Frontend interface that shoppers interact with.
- **Assistant Logic**: Client-side JavaScript that handles voice capture (WebAudio API), requests LiveKit tokens from the backend, establishes direct connection to LiveKit Server using the LiveKit Client SDK, publishes audio tracks, subscribes to remote tracks (e.g., TTS response), and manages UI interactions.
- **Purpose**: Embeds the voice assistant into the merchant's storefront and handles real-time communication via LiveKit.
- **Technologies**: JavaScript, LiveKit Client SDK, WebAudio API, Fetch API (for token).

### 2. Voice AI Assistant Platform

#### 2.1 Shopify App Backend (Remix)
- **Configuration Storage**: Database to store merchant-specific settings.
- **LiveKit Token Service**: Endpoint (e.g., `/api/livekit/token`) that generates LiveKit access tokens (JWTs) upon authenticated request from the frontend.
- **Tool Execution Engine**: (Can be part of Remix or the Bot Service) Processes tool calls from Ultravox to perform actions like product search or UI display via Shopify APIs.
- **Response Processor**: (Likely within the Bot Service) Handles text responses from Ultravox.
- **Technologies**: Node.js, Remix.js, Prisma ORM, LiveKit Server SDK (for token generation).

#### 2.2 LiveKit Server (Self-hosted or Cloud)
- **Signaling Server**: Manages WebSocket connections for room management, participant signaling, and track publishing/subscription.
- **Media Server (WebRTC)**: Handles the efficient transport of real-time audio/video streams between participants.
- **API/Webhooks**: Provides APIs for server-side control (e.g., generating tokens, sending data messages, Egress/Ingress) and webhooks for events (e.g., participant join/leave, track published).
- **Purpose**: Provides the core real-time audio/data transport infrastructure.
- **Technologies**: LiveKit Media Server, Go, WebRTC, WebSockets.

#### 2.3 Bot Participant Service
- **Purpose**: Connects to LiveKit as a participant using the Server SDK. Subscribes to user audio tracks, forwards audio to Replicate/Ultravox, receives NLU/tool results, sends text to Play.ht for TTS, receives TTS audio, and publishes the TTS audio back to the LiveKit room as a new track.
- **Technologies**: Node.js (or other), LiveKit Server SDK, Replicate API client, Play.ht API client.

#### 2.4 TTS Service (Play.ht Standard API)
- **Voice Synthesis**: Converts text responses into speech.
- **Purpose**: Provides high-quality, potentially multilingual voice responses.
- **Integration**: Called via standard REST API by the Bot Participant Service.

### 3. Replicate Platform

#### 3.1 Ultravox Model via Replicate API
- **Speech Understanding**: Processes audio input directly without a separate ASR step
- **Tool Calling**: Identifies when to call specific tools and provides parameters
- **Natural Language Processing**: Understands user intent and generates appropriate responses
- **Technologies**: Ultravox v0.5 model, Replicate API, streaming responses

## Data Flow

### Voice Query Flow
1.  Shopper activates the voice assistant in the storefront (Theme App Extension).
2.  Frontend requests a LiveKit access token from the Shopify App Backend (Remix).
3.  Backend generates and returns the token and LiveKit server URL.
4.  Frontend uses LiveKit Client SDK to connect directly to the LiveKit Server (WebSocket/WebRTC).
5.  Frontend captures audio (WebAudio API) and publishes it as a track to the LiveKit room.
6.  The **Bot Participant Service** (backend) joins the room and subscribes to the user's audio track.
7.  The Bot Service forwards the audio to the **Replicate/Ultravox** model.
8.  Ultravox processes audio and returns text response and/or tool calls to the Bot Service.
9.  The Bot Service (potentially triggering the Tool Execution Engine) processes the response:
    *   If tool call: Executes the tool (e.g., calls Shopify API).
    *   If text response: Sends text to **Play.ht Standard API** for TTS.
10. Play.ht returns synthesized audio data/stream to the Bot Service.
11. The Bot Service publishes the TTS audio as a **new track** into the LiveKit room.
12. Frontend subscribes to the Bot's TTS track via its LiveKit connection and plays the audio response / updates UI based on tool results (if applicable).

### Tool Calling Flow
1. Ultravox identifies a tool action from the user's query (e.g., "Show me red shirts")
2. Replicate returns a structured tool call with parameters to the Bot Service.
3. Bot Service triggers the Tool Execution Engine, which processes the call and queries Shopify APIs for data.
4. Results are formatted according to the UI requirements (e.g., product carousel)
5. Frontend receives display instructions (potentially via LiveKit data channel or inferred from TTS response) and renders the appropriate UI.

## Technical Considerations

### Security
- All API communications use HTTPS/TLS encryption.
- **LiveKit connections secured via JWT tokens generated by the backend.**
- WebSocket/WebRTC connections use standard security mechanisms (WSS, DTLS-SRTP).
- Voice data is processed but not persistently stored (unless required and compliant).
- GDPR/CCPA compliance built into data handling.

### Performance
- **Direct WebRTC connection for low-latency audio streaming via LiveKit.**
- Audio buffering handled by LiveKit and the Bot Participant Service.
- TTS audio streamed back via LiveKit track. Latency depends on Replicate + Play.ht processing times + network hops.

### Scalability
- **LiveKit server designed for horizontal scalability.**
- Stateless design for the Remix backend token endpoint and potentially the audio processing service.
- Docker containerization for deployment.

## Implementation Details

### LiveKit Integration
- **Client-side:** Use `livekit-client` SDK for connection, track publishing/subscription.
- **Backend:** Use `livekit-server-sdk` (Node.js) for token generation and API interactions/webhook handling.
- **Bot Participant Service:** Use `livekit-server-sdk` to join rooms, subscribe/publish tracks, and interact with LiveKit APIs.

### Replicate Integration
- Streaming API for real-time responses
- Tool calling definition and parsing
- Proper error handling and fallbacks
- Optimal audio parameters for Ultravox model

### Tool Calling Framework
- Structured JSON schema for each tool
- Product search, UI display, and navigation tools
- Context maintenance across conversation turns
- Error recovery with graceful degradation

### Play.ht Integration
- Standard REST API for TTS generation.
- Handling of audio stream/data returned by Play.ht.
- Configuration of voice parameters.

## Future Considerations
- Voice cloning for custom assistant voices
- Multi-language support using multilingual models
- Advanced analytics for voice interaction patterns
- Progressive enhancement for various device capabilities

---

This architecture document will be updated as implementation progresses and as the system evolves based on merchant and shopper feedback.