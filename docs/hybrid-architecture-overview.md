# Voice Assistant Hybrid Architecture Overview

## Architecture Summary

The Voice Assistant for Shopify has been implemented using a hybrid approach that leverages:

1. **LiveKit for real-time audio transport**
2. **Replicate/Ultravox for NLU and intent recognition**
3. **Play.ht for high-quality Text-to-Speech synthesis**

This architecture provides low latency, high quality, and reliable voice interaction for shoppers.

## System Components

### Frontend Components

- **Voice Assistant UI**: Shopify theme extension with a voice button and information display
- **LiveKit Client Integration**: Direct WebRTC connection to LiveKit server for audio streaming
- **Audio Processing**: Client-side audio capture and visualization
- **TTS Playback**: Subscription to and playback of the bot's audio responses

### Backend Components

- **Remix App**: Main Shopify app backend handling authentication, API endpoints, and tool execution
- **LiveKit Token Service**: Securely provides LiveKit tokens to authenticate frontend clients
- **Bot Service**: Core service responsible for:
  - **LiveKit Connection**: Joins rooms and handles audio tracks using LiveKit Server SDK
  - **Audio Processing**: Buffers and processes audio for NLU
  - **NLU Integration**: Sends audio to Replicate/Ultravox and processes responses
  - **TTS Integration**: Sends text to Play.ht for speech synthesis
  - **Audio Publishing**: Publishes synthesized speech back to LiveKit room

### External Services

- **LiveKit Server**: WebRTC SFU handling real-time audio streaming
- **Replicate API**: Hosts the Ultravox model for speech-to-text and NLU
- **Play.ht API**: Provides high-quality text-to-speech synthesis

## Data Flow

1. **Activation**: Shopper clicks the voice assistant button
2. **Connection**: Frontend requests token, connects to LiveKit, publishes audio
3. **Bot Join**: Bot service joins the same LiveKit room
4. **Audio Processing**: Bot subscribes to user's audio, buffers it for processing
5. **NLU Processing**: Audio sent to Ultravox, returns text and potential tool calls
6. **TTS Synthesis**: Text response sent to Play.ht, returns synthesized speech
7. **Response Delivery**: Bot publishes TTS audio to LiveKit room as a new track
8. **Frontend Playback**: Frontend receives and plays the TTS audio track
9. **Tool Execution**: (In progress) NLU results trigger tools (e.g., product search)

## Architecture Benefits

- **Low Latency**: Direct WebRTC connection for real-time audio
- **Scalability**: Stateless backend design with distributed services
- **High-Quality Voice**: Professional TTS via Play.ht
- **Reliability**: Robust error handling and reconnection logic

## Deployment Model

The system is deployed using Docker Compose with two main services:

1. **LiveKit Server**: Handles WebRTC traffic
2. **Voice Bot Service**: Manages bot interactions with NLU and TTS

## Next Steps

1. **Tool Execution Framework**: Complete product search capabilities
2. **Cleanup Legacy Code**: Remove obsolete SSE and HTTP POST implementations
3. **Comprehensive Testing**: Verify end-to-end functionality
4. **Production Deployment**: Configure for production with monitoring

## Monitoring Considerations

- **LiveKit Server Metrics**: Track room and participant counts, connection health
- **Bot Service Logs**: Monitor NLU and TTS request/response performance
- **API Endpoint Metrics**: Track response times and error rates
- **User Experience Metrics**: Measure end-to-end latency and completion rates 