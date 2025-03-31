# Plan to Fix Shopify App Proxy Connection Issues (SSE/POST)

**Objective:** Achieve reliable communication between the frontend Theme Extension and the backend (Remix/LiveKit Proxy) via the Shopify App Proxy (`/apps/voice`) using Server-Sent Events (SSE) for responses and HTTP POST for audio data.

**Plan Steps:**

1.  **Verify Shopify App Proxy Configuration:**
    *   **Goal:** Ensure the Shopify app configuration correctly defines the proxy settings.
    *   **Action:** Examine the `shopify.app.toml` file. Confirm that `app_proxy.url` points to the correct backend server URL (e.g., development tunnel or production host) and `app_proxy.subpath` is set to `voice`.
2.  **Enhance Diagnosis & Logging (Client & Server):**
    *   **Goal:** Gain visibility into requests/responses at each stage.
    *   **Action:** Add detailed logging on both client (`voice-assistant-integration.js`) and server (`livekit-proxy.server.js`/Remix route) to trace URLs, headers, paths, session IDs, and connection events.
3.  **Fix Server-Side Proxy Request Handling:**
    *   **Goal:** Ensure the backend correctly interprets requests forwarded by the proxy.
    *   **Action:** Review/modify server code to reliably identify requests via `/apps/voice`, normalize paths correctly, handle CORS appropriately, and set/flush SSE headers correctly.
4.  **Fix Client-Side URL Formation & Connection Logic:**
    *   **Goal:** Ensure the frontend always uses the correct relative proxy path.
    *   **Action:** Audit client code (`voice-assistant-integration.js`) to ensure all `EventSource`/`fetch` calls use the relative path `/apps/voice` and construct query parameters correctly.
5.  **Ensure Session ID Correlation:**
    *   **Goal:** Reliably link POST audio data to the correct user's SSE stream.
    *   **Action:** Implement logic for the server to issue a unique `sessionId` on SSE connection, have the client include it in POST requests, and the server use it to route data.
6.  **Test & Iterate:**
    *   **Goal:** Validate fixes in a realistic environment.
    *   **Action:** Deploy changes to a development store, use logs and browser tools to trace requests via the proxy, perform end-to-end tests, and refine based on results.

**Relevant Files:**
*   `shopify.app.toml` (Proxy Configuration)
*   `extensions/voice-assistant/assets/voice-assistant-integration.js` (Client-side Logic)
*   `app/livekit-proxy.server.js` (Potential Server-side Handling)
*   Remix route handlers associated with `/apps/voice` (Potential Server-side Handling)