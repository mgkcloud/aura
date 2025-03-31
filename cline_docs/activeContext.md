# Active Context

## What You're Working On Now
The primary focus is fixing the end-to-end communication flow using Server-Sent Events (SSE) for responses and HTTP POST for audio, specifically addressing issues with the Shopify App Proxy integration. This involves debugging and correcting path handling, URL formation, and SSE/CORS configurations on both the client-side (Theme Extension) and server-side (Remix App Backend & LiveKit Proxy).

## Recent Changes (as of March 22, 2025 build log)
- Reviewed SSE implementation, identifying frontend/backend issues.
- Discovered missing HTTP POST/SSE support in the Docker LiveKit container and backend session/chunk handling.
- Added critical backend update tasks and detailed frontend error handling tasks to the plan.
- Found URL formatting and potential race condition issues in frontend SSE logic.
- Prioritized backend and frontend fixes related to SSE/Proxy connection as critical.
- Previous work (March 21) involved completing the initial SSE and HTTP POST implementations, including chunking, sequence tracking, and basic error handling.

## Next Steps (Priority Order)
1.  **Fix Shopify App Proxy SSE Connection Issues (CRITICAL):**
    *   Implement enhanced diagnostics (logging on client/server).
    *   Fix server-side path handling (`livekit-proxy.server.js`) for proxy routes.
    *   Fix client-side URL formation (`voice-assistant-integration.js`) to always use `/apps/voice` proxy path and include session tracking.
    *   Fix SSE implementation details (headers, CORS, flushing, error handling, session correlation).
2.  **Improve Error Handling and Connection Recovery (HIGH):**
    *   Enhance server-side error logging, response format, and cleanup.
    *   Improve client-side error handling (duplicate listeners, backoff, state management, user feedback).
3.  **Test and Debug SSE Implementation (HIGH):**
    *   Test component functionality (path normalization, proxy connection, POST sending, session correlation).
    *   Test end-to-end flow through Shopify proxy, including network interruptions and reconnection.
4.  **Implement Tool Calling Framework (HIGH):**
    *   Define JSON schemas for tools (search, display, navigation).
    *   Connect tools to Shopify Storefront API.
    *   Create execution engine.
5.  **Add Text-to-Speech (MEDIUM):**
    *   Research/select approach (Web Speech API preferred).
    *   Implement synthesis, controls, UI feedback, and fallbacks.
6.  **Production Preparation (LOW):**
    *   Testing plan, finalize error handling, monitoring, logging, cross-browser testing, deployment docs.

*(Based on `docs/implementation-plan.md` as of March 28, 2025)*