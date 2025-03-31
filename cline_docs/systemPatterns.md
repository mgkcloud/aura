# System Patterns

## How the System is Built (Core Components)
1.  **Shopify App Backend (Remix)**: Handles configuration storage (Prisma), processes API requests, manages sessions, and orchestrates tool execution based on AI responses. Runs on Node.js.
2.  **Theme App Extension (Frontend JS)**: Embeds the voice UI in the storefront. Captures audio (WebRTC), handles visualization, sends audio data, receives responses, updates UI, and potentially plays TTS audio. Uses JavaScript, WebAudio API.
3.  **LiveKit Proxy Server (Node.js/Docker)**: Acts as an intermediary for audio data. Initially handled WebSocket streaming, but is being updated/needs updates to handle HTTP POST audio submissions and facilitate SSE response streaming from the backend/AI. It buffers audio and interacts with the Replicate API.
4.  **Replicate API (Ultravox Model)**: External service providing the core AI capabilities: direct audio-to-intent processing (speech understanding), natural language response generation, and identifying "tool calls" needed to fulfill user requests.
5.  **Tool Execution Engine (Part of Backend)**: A framework (to be fully implemented) that interprets tool calls from Ultravox and executes corresponding actions (e.g., querying Shopify Storefront API for products, triggering navigation).
6.  **TTS Service (Planned)**: Intended to convert text responses into audible speech, likely using the Web Speech API client-side as a primary approach.

## Key Technical Decisions & Architecture Patterns
*   **Shift from WebSocket to HTTP POST + SSE**: A major recent decision was to move away from using WebSockets for audio transport. The current/target architecture uses:
    *   **HTTP POST**: For sending chunked audio data from the client (Theme Extension) to the backend (via Shopify App Proxy).
    *   **Server-Sent Events (SSE)**: For streaming responses (status updates, AI results, errors) from the backend to the client.
*   **Shopify App Proxy**: All communication between the storefront extension and the backend *must* go through the Shopify App Proxy (`/apps/voice`) for security and context. Getting SSE to work reliably through the proxy is a current critical challenge.
*   **Ultravox via Replicate**: Using a specific AI model (Ultravox) hosted on Replicate for its direct audio processing and tool-calling capabilities. Requires API key management.
*   **Tool Calling Framework**: Decouples AI intent recognition from action execution. Ultravox identifies *what* needs to be done (e.g., search products), and the backend framework figures out *how* (e.g., call Shopify API). (This framework is largely pending implementation).
*   **Client-Side Audio Processing**: Leveraging WebRTC and WebAudio APIs in the browser for high-quality audio capture, noise reduction (Krisp), and visualization data extraction before sending data.
*   **Remix Framework**: Using Remix for the Shopify App backend, leveraging its capabilities for routing, data loading, and server-side rendering/logic.
*   **Docker for Proxy**: The LiveKit Proxy server is containerized using Docker, though its current state needs updates to support the POST/SSE model fully.
*   **Stateless Design**: Aiming for a stateless backend design where possible to support scalability.
*   **Security via Shopify Auth/Proxy**: Relying on Shopify's OAuth for admin authentication and the App Proxy mechanism for securing frontend-backend communication.