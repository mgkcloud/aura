# Product Context

## Why This Project Exists
This project, the Voice AI Shopping Assistant, exists to enhance the customer shopping experience on Shopify stores by providing a voice-activated AI assistant.

## What Problems It Solves
- Improves product discovery and search, especially for large catalogs.
- Aims to increase conversion rates and reduce cart abandonment.
- Provides a hands-free, accessible shopping interface for users, including those with accessibility needs.
- Differentiates merchant stores with innovative AI technology.
- Potentially gathers customer intent data for merchants.

## How It Should Work
- A floating voice assistant button appears on the merchant's storefront (via a Theme App Extension).
- Shoppers activate the assistant (e.g., by clicking).
- Audio is captured, processed (noise reduction, 16kHz mono), and sent via HTTP POST to the backend.
- The backend (Remix app + LiveKit Proxy) forwards audio to the Ultravox AI model on Replicate.
- Ultravox processes the audio, understands intent, and generates a response, potentially including "tool calls" (like product search).
- The backend executes necessary tool calls (e.g., querying Shopify Storefront API).
- The response is streamed back to the frontend via Server-Sent Events (SSE).
- The frontend displays information, potentially plays a Text-to-Speech response, and executes UI actions (like navigation or showing products).
- Merchants configure the assistant's appearance, behavior, and view analytics via the Shopify Admin interface.