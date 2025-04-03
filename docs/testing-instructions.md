# Voice Assistant Testing Instructions

This document provides instructions for testing the voice assistant solution implemented with LiveKit, Replicate/Ultravox, and Play.ht.

## Prerequisites

1. Environment Variables
   - `LIVEKIT_URL`: URL of your LiveKit server
   - `LIVEKIT_KEY`: Your LiveKit API key
   - `LIVEKIT_SECRET`: Your LiveKit API secret
   - `REPLICATE_API_TOKEN`: Your Replicate API token
   - `ULTRAVOX_MODEL_VERSION`: Ultravox model version identifier
   - `PLAYHT_USER_ID`: Your Play.ht User ID
   - `PLAYHT_SECRET_KEY`: Your Play.ht Secret Key

2. Running Services
   - LiveKit Server (available via Docker Compose or external)
   - Voice Bot Service (Node.js service for bot functionality)

## Setup Instructions

### 1. Environment Configuration

Copy the `.env.example` file to `.env` and fill in the required values:

```bash
cp .env.example .env
# Edit .env file with your credentials
```

### 2. Start Services Using Docker Compose

```bash
docker-compose up
```

This will start both the LiveKit server and the Voice Bot Service.

### 3. Start Shopify App (Development)

In a separate terminal:

```bash
npm run dev
```

## Testing Flow

### 1. Basic Voice Response Test

1. Install the extension on a test store
2. Navigate to a store page with the voice assistant
3. Click the voice assistant button to activate
4. Speak a simple question (e.g., "Hello, can you help me find a product?")
5. Verify that:
   - The audio is captured and sent to LiveKit
   - The bot joins the room
   - Ultravox processes the audio
   - Play.ht synthesizes a response
   - The TTS audio is played back on the frontend

### 2. Connection Testing

1. Test disconnection handling by temporarily disabling network
2. Verify the assistant recovers and reconnects properly
3. Test with different browsers to ensure cross-browser compatibility

### 3. Audio Quality Testing

1. Test in noisy environments to verify noise suppression
2. Test with different microphones
3. Verify TTS audio quality is acceptable

## Troubleshooting

### LiveKit Connection Issues

- Check LiveKit server logs: `docker-compose logs livekit`
- Verify LiveKit URL and credentials in `.env`
- Ensure ports 7880, 7881, and 7882 are accessible

### Bot Service Issues

- Check Bot Service logs: `docker-compose logs voice-bot`
- Verify all required environment variables are set
- Check for any errors in the console or network tab

### Audio Issues

- Verify browser permissions for microphone
- Check for any console errors related to audio capture
- Verify TTS audio is being published (check Bot Service logs)

## Next Steps for Testing

- Implement and test the Tool Execution framework
- Clean up legacy code and verify functionality
- Conduct performance testing with various network conditions
- Test with real Shopify stores and collect user feedback 