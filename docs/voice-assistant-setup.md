# Voice Assistant Integration Setup

This document explains how to set up and troubleshoot the Voice Assistant feature in the Shopify app using a direct connection to LiveKit.

## What We Need

1.  **LiveKit Server:** A running LiveKit server instance (either self-hosted via Docker or cloud-based).
2.  **Backend Endpoint:** A Remix backend route to generate LiveKit access tokens.
3.  **Frontend Logic:** Client-side JavaScript using the LiveKit SDK to connect directly.
4.  **Environment Configuration:** Correct API keys and URLs in the `.env` file.

## Setup Instructions

### 1. Configure Environment Variables

Copy the example environment file and configure it with your credentials:

```bash
cp .env.example .env
```

Edit the `.env` file to include:
- Your Shopify API credentials
- Your Replicate API token and model version (if `livekit-proxy.server.js` still handles this)
- Your **LiveKit Server** API Key (`LIVEKIT_KEY`) and Secret (`LIVEKIT_SECRET`)
- The **publicly accessible URL** for your LiveKit server (`LIVEKIT_URL`, e.g., `wss://your-livekit-domain.com` or `wss://your-tunnel.trycloudflare.com`)

```.env
# Shopify credentials
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...

# Replicate credentials (if applicable)
REPLICATE_API_TOKEN=...
ULTRAVOX_MODEL_VERSION=...

# LiveKit configuration
LIVEKIT_URL=wss://your-livekit-domain-or-tunnel.com # Public WSS URL
LIVEKIT_KEY=your_api_key
LIVEKIT_SECRET=your_api_secret

# Database URL
DATABASE_URL=file:./dev.db
```

### 2. Start the LiveKit Server

Ensure your LiveKit server instance is running and accessible at the `LIVEKIT_URL` specified in your `.env` file. If running locally via Docker, ensure it's exposed via a tunnel (like ngrok or Cloudflare Tunnel) and `LIVEKIT_URL` points to the tunnel's WSS address.

```bash
# Example: If using the provided docker-compose setup
docker-compose up livekit # Or similar command
# Start your tunnel (e.g., cloudflared tunnel run my-tunnel)
```

### 3. Start the Shopify App

Start the Shopify app Remix dev server. This server will handle API requests and generate LiveKit tokens.

```bash
npm run dev
```

### 4. Test the Connection

The frontend will now attempt to connect directly to the LiveKit server upon activation.

## How It Works

1.  The frontend voice assistant (in the Shopify Theme App Extension) is activated by the shopper.
2.  The frontend JavaScript makes an authenticated request to a dedicated Remix backend route (e.g., `/api/livekit/token`).
3.  The Remix backend verifies the request and uses the `LIVEKIT_KEY` and `LIVEKIT_SECRET` to generate a short-lived LiveKit client access token (JWT) specifying the room name and participant identity.
4.  The backend returns the LiveKit server URL (`LIVEKIT_URL`) and the generated token to the frontend.
5.  The frontend uses the LiveKit Client SDK (`livekit-client`) to establish a *direct* WebSocket connection to the `LIVEKIT_URL` using the token.
6.  The LiveKit SDK handles the underlying WebRTC connections for audio streaming between the client and the LiveKit server.
7.  Audio data published by the client to the LiveKit room can trigger server-side events or be processed by server-side participants/bots (potentially interacting with Replicate/Ultravox).
8.  Responses (e.g., TTS audio generated based on Ultravox output) are sent back to the client via the same LiveKit connection.

**Note:** The Shopify App Proxy (`/apps/voice`) is **not** used for the real-time audio connection. It might still be used for other standard API calls between the theme and the backend if needed.

## Troubleshooting

### Connection Issues

If the voice assistant can't connect:

1.  **Check LiveKit Server:** Ensure it's running and accessible from the public internet (or your tunnel) at the `LIVEKIT_URL`. Test the URL using a generic WebSocket client.
2.  **Check Backend Token Endpoint:** Verify the Remix backend route that generates tokens is running and accessible. Check its logs for errors during token generation.
3.  **Check LiveKit Credentials:** Ensure `LIVEKIT_URL`, `LIVEKIT_KEY`, and `LIVEKIT_SECRET` in your `.env` file are correct for your LiveKit instance.
4.  **Check Frontend Logs:** Open the browser's developer console on the storefront page where the assistant is active. Look for errors from the LiveKit Client SDK or during the token fetch request.
5.  **Check CORS:** Ensure your Remix backend route handling the token request has appropriate CORS headers to allow requests from the Shopify storefront origin (`https://your-shop-domain.myshopify.com`). The LiveKit server itself usually handles CORS for WebSocket connections automatically.
6.  **Check Tunnel (if applicable):** If using ngrok or Cloudflare Tunnel, ensure the tunnel is active and correctly routing traffic to your local LiveKit server's port (usually 7880 for WSS).

### Common Issues

1.  **Token Generation Failed (Backend Logs):** Usually indicates incorrect `LIVEKIT_KEY` or `LIVEKIT_SECRET`, or an issue connecting to the LiveKit server *from the backend* if server-side validation is used.
2.  **WebSocket Connection Error (Frontend Console):** Could be an incorrect `LIVEKIT_URL`, a down LiveKit server, firewall issues, or problems with the tunnel.
3.  **Authentication Error / Invalid Token (Frontend Console):** Token might be expired, malformed, or have incorrect permissions. Check backend token generation logic.
4.  **Unable to Access Microphone:** Check browser permissions; ensure HTTPS is used (required for `getUserMedia`).

## Advanced Configuration

### Running in Production

For production environments:
1.  Deploy your LiveKit server to a suitable hosting environment and configure a stable public `LIVEKIT_URL` (e.g., `wss://livekit.yourdomain.com`).
2.  Deploy your Remix backend application.
3.  Ensure all environment variables (`LIVEKIT_URL`, `LIVEKIT_KEY`, `LIVEKIT_SECRET`, database URLs, etc.) are correctly set in the production environment.
4.  Configure appropriate scaling for both the LiveKit server and the Remix backend based on expected load.
5.  Restrict CORS headers on your token endpoint to only allow your Shopify domain(s).

### Docker Setup

The LiveKit server itself is typically run using Docker/Docker Compose. Refer to the official LiveKit deployment documentation for production setups. Your Remix application can also be containerized for deployment.

## Next Steps

1.  Test the voice assistant's direct LiveKit connection in your Shopify store.
2.  Implement the server-side logic to handle audio tracks received in the LiveKit room (e.g., forwarding to Replicate/Ultravox).
3.  Implement the logic to send TTS responses back to the client via LiveKit.
4.  Customize prompts, tools, and capabilities.
5.  Deploy to production. 