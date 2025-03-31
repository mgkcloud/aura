# Voice AI Shopping Assistant - System Architecture

## System Overview

The Voice AI Shopping Assistant is built on a modern, scalable architecture that integrates with the Shopify platform and leverages the Ultravox model through Replicate's API for voice processing and tool calling. This document outlines the key components of the system and how they interact.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Shopify Merchant Store                          │
│                                                                         │
│  ┌─────────────────────┐        ┌────────────────────────────────────┐  │
│  │                     │        │      Theme App Extension            │  │
│  │  Shopify Admin      │        │                                     │  │
│  │                     │        │  ┌──────────────┐   ┌────────────┐ │  │
│  │ ┌───────────────┐  │        │  │ Voice UI     │   │ Assistant  │ │  │
│  │ │ App Settings  │  │        │  │ Components   │   │ Logic      │ │  │
│  │ │ Configuration │  │        │  └──────┬───────┘   └─────┬──────┘ │  │
│  │ └───────┬───────┘  │        │         │                 │        │  │
│  │         │          │        │         └─────────┬───────┘        │  │
│  └─────────┼──────────┘        └─────────────────┬┴────────────────┘  │
│            │                                     │                     │
└────────────┼─────────────────────────────────────┼─────────────────────┘
             │                                     │
             │                   ┌─────────────────┘
             │                   │  WebSocket Audio Stream
┌────────────┼───────────────────┼─────────────────────────────────────────┐
│            │                   │                                          │
│  ┌─────────▼─────────┐       ┌─▼────────────────┐     ┌───────────────┐  │
│  │                   │       │                  │     │               │  │
│  │  Shopify App      │       │  LiveKit Proxy   │     │ TTS Service   │  │
│  │  Backend          │       │  Server          │     │               │  │
│  │                   │       │                  │     │               │  │
│  │ ┌───────────────┐ │       │ ┌────────────┐  │     │ ┌─────────┐   │  │
│  │ │ Configuration │ │       │ │ Audio      │  │     │ │ Voice   │   │  │
│  │ │ Storage       │ │       │ │ Processor  │  │     │ │ Synth   │   │  │
│  │ └───────────────┘ │       │ └─────┬──────┘  │     │ └─────────┘   │  │
│  │                   │       │       │         │     │               │  │
│  └────────┬──────────┘       └───────┼─────────┘     └───────────────┘  │
│           │                          │                        ▲          │
│           │       ┌──────────────────┘                        │          │
│           │       │                                           │          │
│  ┌────────▼───────▼───┐                              ┌────────┴────────┐ │
│  │                    │                              │                 │ │
│  │ Tool Execution     │◄─────────────────────────────┤ Response        │ │
│  │ Engine             │                              │ Processor       │ │
│  │                    │                              │                 │ │
│  └────────┬───────────┘                              └────────┬────────┘ │
│           │                                                   │          │
│           │                                                   │          │
│  Voice AI Assistant Platform                                  │          │
│                                                               │          │
└───────────┼───────────────────────────────────────────────────┼──────────┘
            │                                                   │
            ▼                                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │  │
│  │  Replicate API                                                      │  │
│  │                                                                     │  │
│  │  ┌─────────────────────────┐                                        │  │
│  │  │ Ultravox Model          │                                        │  │
│  │  │                         │                                        │  │
│  │  │ - Speech Understanding  │                                        │  │
│  │  │ - Tool Calling          │                                        │  │
│  │  │ - Natural Language      │                                        │  │
│  │  │   Processing            │                                        │  │
│  │  └─────────────────────────┘                                        │  │
│  │                                                                     │  │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  Replicate Platform                                                       │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

**Diagram Description:**

The diagram illustrates the flow: The Shopper interacts with the Voice UI in the Theme App Extension. For voice input, the frontend requests an access token from the Shopify App Backend. Using this token, it establishes a **direct WebSocket/WebRTC connection** to the LiveKit Server for real-time audio streaming. The LiveKit server can then interact with backend services (like a processing service connecting to Replicate) or directly handle TTS. The Shopify App Backend handles configuration, standard API interactions (possibly via App Proxy), and tool execution logic triggered by assistant responses.

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

#### 2.1 Shopify App Backend
- **Configuration Storage**: Database to store merchant-specific settings.
- **LiveKit Token Service**: Endpoint (e.g., `/api/livekit/token`) that generates LiveKit access tokens (JWTs) upon authenticated request from the frontend.
- **Tool Execution Engine**: Processes tool calls from the Ultravox model (potentially received via LiveKit webhook or a dedicated processing service) to perform actions like product search or UI display.
- **Response Processor**: Handles the text responses and prepares them for TTS (potentially triggering TTS via LiveKit Server API).
- **Technologies**: Node.js, Remix.js, Prisma ORM, LiveKit Server SDK (for token generation).

#### 2.2 LiveKit Server (Self-hosted or Cloud)
- **Signaling Server**: Manages WebSocket connections for room management, participant signaling, and track publishing/subscription.
- **Media Server (WebRTC)**: Handles the efficient transport of real-time audio/video streams between participants.
- **API/Webhooks**: Provides APIs for server-side control (e.g., generating tokens, sending data messages, Egress/Ingress) and webhooks for events (e.g., participant join/leave, track published).
- **Purpose**: Provides the core real-time communication infrastructure.
- **Technologies**: LiveKit Media Server, Go, WebRTC, WebSockets.

#### 2.3 Optional: Audio Processing Service (if separate from Backend)
- **Purpose**: Connects to LiveKit as a participant (e.g., a bot) to receive audio tracks, forwards them to Replicate/Ultravox, receives results, and potentially initiates TTS or sends results back via LiveKit data messages or API calls to the main backend.
- **Technologies**: Node.js (or other), LiveKit Server SDK, Replicate API client.

#### 2.4 TTS Service
- **Voice Synthesis**: Converts text responses into speech.
- **Purpose**: Creates natural voice responses for the assistant.
- **Integration**: Can be integrated via LiveKit Server API (e.g., triggering synthesis and playing back into the room) or handled by the client subscribing to text messages and performing client-side TTS.

### 3. Replicate Platform

#### 3.1 Ultravox Model via Replicate API
- **Speech Understanding**: Processes audio input directly without a separate ASR step
- **Tool Calling**: Identifies when to call specific tools and provides parameters
- **Natural Language Processing**: Understands user intent and generates appropriate responses
- **Technologies**: Ultravox v0.5 model, Replicate API, streaming responses

## Data Flow

### Voice Query Flow
1.  Shopper activates the voice assistant in the storefront (Theme App Extension).
2.  Frontend requests a LiveKit access token from the Shopify App Backend (e.g., via fetch to `/api/livekit/token`).
3.  Backend generates and returns the token and LiveKit server URL.
4.  Frontend uses LiveKit Client SDK to connect directly to the LiveKit Server (WebSocket/WebRTC).
5.  Frontend captures audio (WebAudio API) and publishes it as a track to the LiveKit room.
6.  A server-side component (either the main Backend reacting to webhooks/API, or a dedicated Audio Processing Service connected as a participant) receives the audio track.
7.  The server-side component forwards the audio to the Replicate/Ultravox model.
8.  Ultravox processes audio and returns text/tool calls to the server-side component.
9.  Server-side component processes the response:
    *   If tool call: Instructs the main Backend to execute the tool.
    *   If text response: Sends text to TTS Service (e.g., via LiveKit API).
10. TTS service generates audio and plays it back into the LiveKit room (or sends audio data back to the client).
11. Frontend receives the audio track (or text/data message) via its LiveKit connection and plays the audio response / updates UI.

### Tool Calling Flow
1. Ultravox identifies a tool action from the user's query (e.g., "Show me red shirts")
2. Replicate returns a structured tool call with parameters (e.g., `searchProducts(color: "red", category: "shirts")`)
3. Tool Execution Engine processes the call and queries Shopify APIs for data
4. Results are formatted according to the UI requirements (e.g., product carousel)
5. Frontend receives the display instructions and renders the appropriate UI

## Technical Considerations

### Security
- All API communications use HTTPS/TLS encryption.
- **LiveKit connections secured via JWT tokens generated by the backend.**
- WebSocket/WebRTC connections use standard security mechanisms (WSS, DTLS-SRTP).
- Voice data is processed but not persistently stored (unless required and compliant).
- GDPR/CCPA compliance built into data handling.

### Performance
- **Direct WebRTC connection for low-latency audio streaming via LiveKit.**
- Audio buffering handled by LiveKit and potentially optimized on the server-side before sending to Replicate.
- Streaming audio playback via LiveKit.

### Scalability
- **LiveKit server designed for horizontal scalability.**
- Stateless design for the Remix backend token endpoint and potentially the audio processing service.
- Docker containerization for deployment.

## Implementation Details

### LiveKit Integration
- **Client-side:** Use `livekit-client` SDK for connection, track publishing/subscription.
- **Backend:** Use `livekit-server-sdk` (Node.js) for token generation and potentially API interactions/webhook handling.
- **Audio Processing Service (Optional):** Use `livekit-server-sdk` or `livekit-client` (as a bot participant) to interact with rooms and tracks.

### Replicate Integration
- Streaming API for real-time responses
- Tool calling definition and execution
- Proper error handling and fallbacks
- Optimal audio parameters for Ultravox model

### Tool Calling Framework
- Structured JSON schema for each tool
- Product search, UI display, and navigation tools
- Context maintenance across conversation turns
- Error recovery with graceful degradation

## Future Considerations
- Voice cloning for custom assistant voices
- Multi-language support using multilingual models
- Advanced analytics for voice interaction patterns
- Progressive enhancement for various device capabilities

---

This architecture document will be updated as implementation progresses and as the system evolves based on merchant and shopper feedback.