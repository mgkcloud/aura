# Tech Context

## Technologies Used
*   **Frontend (Theme Extension & Admin)**:
    *   JavaScript / TypeScript
    *   React (for Admin UI)
    *   WebAudio API (for audio capture/processing)
    *   WebRTC (underlying audio transport/processing via LiveKit client)
    *   EventSource API (for SSE client)
    *   Fetch API (for HTTP POST audio)
    *   Shopify Polaris (for Admin UI components)
    *   Shopify App Bridge (for Admin integration)
    *   CSS / CSS Modules / SASS
    *   LiveKit Client SDK
    *   Krisp Noise Filter (via LiveKit)
*   **Backend (Shopify App)**:
    *   Node.js
    *   Remix.js Framework
    *   Prisma ORM (Database interaction - specific DB like MySQL/PostgreSQL not explicitly confirmed everywhere but mentioned in guidelines)
    *   TypeScript
*   **Audio Proxy Server**:
    *   Node.js (ES Module)
    *   Docker
    *   Potentially libraries for HTTP/SSE handling (needs update)
*   **AI/Voice**:
    *   Replicate API
    *   Ultravox Model (v0.5 mentioned)
    *   Web Speech API (Planned for client-side TTS, with fallbacks)
*   **DevOps/Tooling**:
    *   Git / GitHub
    *   npm (Package Manager)
    *   ESLint / Prettier (Code Style/Linting)
    *   Docker
    *   (CI/CD with GitHub Actions, Hosting on Vercel/Cloudflare, Monitoring with Sentry mentioned as standard practice in guidelines, but not confirmed as implemented yet)

## Development Setup
*   **Code Organization**: Monorepo structure with `app/` (Remix backend), `extensions/` (Shopify extensions), `prisma/`, `docs/`, `scripts/`, `public/`.
*   **Version Control**: Git with GitHub. Workflow involves feature branches (`feature/...`, `fix/...`), conventional commits, PRs to `main`, code reviews, and squash merges.
*   **Coding Standards**: Enforced via ESLint and Prettier. Follows conventions outlined in `docs/technical-guidelines.md` (kebab-case files, PascalCase components, camelCase functions/vars, TypeScript interfaces, JSDoc).
*   **Local Environment**: Likely involves running the Remix app locally (e.g., `npm run dev`), potentially using the Shopify CLI for app/extension development and tunneling (e.g., ngrok or Cloudflare tunnel) for testing webhooks and proxy connections. Docker is used for the LiveKit proxy. Requires environment variables for API keys (Shopify, Replicate).

## Technical Constraints
*   **Shopify Platform**:
    *   Must use Shopify App Proxy for frontend-backend communication (`/apps/voice`).
    *   Subject to Shopify API rate limits (Admin & Storefront GraphQL).
    *   Requires adherence to Shopify OAuth for authentication.
    *   Theme App Extension limitations and best practices must be followed.
*   **Browser APIs**:
    *   Reliant on browser support for WebAudio, WebRTC, EventSource, Fetch, potentially Web Speech API. Requires handling compatibility and fallbacks.
    *   Microphone access requires explicit user permission.
*   **Performance**:
    *   Target low impact on storefront load times (< 0.3s).
    *   Target small JS bundle size (< 100KB gzipped).
    *   Requires optimization for audio processing and network latency (especially critical for real-time voice).
*   **Security**:
    *   API keys must be kept secure (backend/env vars).
    *   All communication via HTTPS/TLS.
    *   CORS must be correctly configured, especially for the proxy/SSE.
    *   Webhook verification (HMAC) is required.
    *   Input validation and sanitization are necessary.
*   **AI Model**:
    *   Dependent on Replicate API availability and performance.
    *   Requires specific audio format (16kHz, mono) for Ultravox.
    *   Streaming responses need careful parsing.
*   **Connectivity**: Assumes reasonable network conditions for audio streaming/POSTing and SSE connections. Needs robust error handling and reconnection logic for interruptions.