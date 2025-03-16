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

## Component Descriptions

### 1. Shopify Integration Components

#### 1.1 Shopify Admin Interface
- **App Settings & Configuration**: React-based interface built using Shopify App Bridge and Polaris components
- **Purpose**: Allows merchants to configure the voice assistant, customize appearance, and view analytics
- **Technologies**: React, Remix, Shopify App Bridge, Polaris UI components

#### 1.2 Theme App Extension
- **Voice UI Components**: Frontend interface that shoppers interact with
- **Assistant Logic**: Client-side JavaScript that handles voice capture, visualization, and UI interactions
- **Purpose**: Embeds the voice assistant into the merchant's storefront
- **Technologies**: JavaScript, WebSockets, WebAudio API

### 2. Voice AI Assistant Platform

#### 2.1 Shopify App Backend
- **Configuration Storage**: Database to store merchant-specific settings
- **Tool Execution Engine**: Processes tool calls from the Ultravox model to perform actions like product search or UI display
- **Response Processor**: Handles the text responses and prepares them for TTS
- **Technologies**: Node.js, Remix.js, Prisma ORM

#### 2.2 LiveKit Proxy Server
- **Audio Processor**: WebSocket server that buffers audio chunks and forwards them to Replicate
- **Purpose**: Handles real-time audio streaming between the frontend and Replicate
- **Technologies**: Node.js, WebSockets, Docker container

#### 2.3 TTS Service
- **Voice Synthesis**: Converts text responses from Ultravox into speech
- **Purpose**: Creates natural voice responses for the assistant
- **Technologies**: LiveKit integration with TTS service (e.g., Rime)

### 3. Replicate Platform

#### 3.1 Ultravox Model via Replicate API
- **Speech Understanding**: Processes audio input directly without a separate ASR step
- **Tool Calling**: Identifies when to call specific tools and provides parameters
- **Natural Language Processing**: Understands user intent and generates appropriate responses
- **Technologies**: Ultravox v0.5 model, Replicate API, streaming responses

## Data Flow

### Voice Query Flow
1. Shopper activates the voice assistant in the storefront (Theme App Extension)
2. Frontend captures audio via WebAudio API and streams it through WebSockets
3. LiveKit Proxy receives audio chunks, buffers them, and forwards to Replicate
4. Ultravox model on Replicate processes audio and returns text with tool calling information
5. Backend executes tool calls (product search, UI display, navigation)
6. Text response is sent to TTS service for voice synthesis
7. Audio response is streamed back to the frontend
8. Frontend plays the audio response and updates UI based on tool actions

### Tool Calling Flow
1. Ultravox identifies a tool action from the user's query (e.g., "Show me red shirts")
2. Replicate returns a structured tool call with parameters (e.g., `searchProducts(color: "red", category: "shirts")`)
3. Tool Execution Engine processes the call and queries Shopify APIs for data
4. Results are formatted according to the UI requirements (e.g., product carousel)
5. Frontend receives the display instructions and renders the appropriate UI

## Technical Considerations

### Security
- All API communications use HTTPS/TLS encryption
- WebSocket connections secured with proper authentication
- Voice data is processed but not persistently stored
- GDPR/CCPA compliance built into data handling

### Performance
- Binary WebSocket data for reduced latency
- Audio buffering optimized for speech recognition
- Progressive processing for faster response times
- Streaming audio playback for immediate feedback

### Scalability
- Docker containerization for LiveKit proxy
- Stateless design to support horizontal scaling
- Efficient resource usage with proper cleanup
- Rate limiting to prevent API abuse

## Implementation Details

### LiveKit Proxy Server
- ES Module-based Node.js implementation
- WebSocket server for audio streaming
- Audio buffer management for optimal chunks
- Error handling and reconnection logic

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