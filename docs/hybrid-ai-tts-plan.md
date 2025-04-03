# Hybrid AI/TTS Implementation Plan (Option C)

**Objective:** Implement a voice assistant architecture using LiveKit for audio transport, Replicate/Ultravox for NLU/Tool-Calling, and Play.ht's standard API for high-quality TTS.

**Core Decisions:**

*   **Backend Audio Reception:** A dedicated backend service/bot will join the LiveKit room as a participant using the LiveKit Server SDK to subscribe to the user's audio track.
*   **TTS Audio Delivery:** The backend service/bot will publish the TTS audio received from Play.ht as a *new audio track* into the LiveKit room. The frontend will subscribe to this track.

## Implementation Phases

**Phase 1: Foundational LiveKit & Replicate Integration**

1.  **Complete LiveKit Direct Connection Refactor:** (Ref: `docs/implementation-plan.md`, Section 8.3)
    *   Finalize frontend refactor (LiveKit Client SDK connection, audio publishing).
    *   Ensure backend LiveKit token endpoint (`/api/livekit/token`) is functional.
    *   *Verification:* Client audio tracks successfully published to LiveKit room.
2.  **Backend Bot Participant Implementation:**
    *   Develop a backend service/bot using LiveKit Server SDK.
    *   Implement logic for the bot to join the correct LiveKit room upon user connection/activation.
    *   Implement logic for the bot to subscribe to the user's published audio track.
    *   Implement audio buffering suitable for sending to Replicate.
    *   *Verification:* Bot successfully joins room and receives user audio stream.
3.  **Replicate API Forwarding:**
    *   Implement the API call from the bot to the Replicate API (Ultravox model) using buffered audio.
    *   Handle Replicate authentication and errors.
    *   *Verification:* Audio successfully forwarded to Replicate.
4.  **Handle Replicate Response (NLU/Text):**
    *   Implement logic in the bot to receive and parse the response from Replicate/Ultravox.
    *   Extract NLU results, Tool Calls, and the textual response for TTS.
    *   *Verification:* Bot correctly parses Ultravox output.

**Phase 2: Tool Calling Implementation**

5.  **Implement Tool Execution Engine:** (Ref: `docs/implementation-plan.md`, Section 5)
    *   Based on parsed Tool Calls, implement execution logic (e.g., querying Shopify Storefront API) within the bot or main Remix backend (triggered by the bot).
    *   Handle tool execution results.
    *   *Verification:* Backend executes tool calls based on Replicate output.

**Phase 3: Play.ht TTS Integration & Response Delivery**

6.  **Integrate Play.ht Standard API for TTS:**
    *   Set up Play.ht account and secure API credentials.
    *   Implement the API call from the bot to Play.ht's standard TTS endpoint using the text response from Replicate.
    *   Configure Play.ht voice, language, and quality parameters.
    *   Handle the audio output from Play.ht (stream, URL, or raw data).
    *   *Verification:* Bot sends text to Play.ht and receives synthesized audio.
7.  **Deliver TTS Audio via LiveKit Track:**
    *   Implement logic for the bot to publish a *new audio track* to the LiveKit room.
    *   Stream the TTS audio received from Play.ht onto this published track.
    *   *Verification:* Bot successfully publishes TTS audio track to the room.
8.  **Frontend TTS Playback:**
    *   Update frontend (`voice-assistant-integration.js` / `voice-assistant.js`) to subscribe to the bot's published TTS audio track.
    *   Implement playback logic for the subscribed TTS track.
    *   *Verification:* Frontend receives and plays the synthesized voice response from the bot's track.

**Phase 4: Refinement & Optimization**

9.  **End-to-End Error Handling:**
    *   Implement comprehensive error handling across the flow (LiveKit, Replicate, Tools, Play.ht).
    *   Provide clear user feedback for failures.
10. **Latency Measurement & Optimization:**
    *   Measure total voice-in to voice-out latency.
    *   Identify and optimize bottlenecks (Replicate, Tools, Play.ht, buffering).
11. **Testing:**
    *   Conduct thorough unit, integration, and end-to-end testing.

## Updated Architecture Diagram

```mermaid
graph TD
    subgraph Frontend (Browser)
        FE_UI[Voice Assistant UI]
        FE_LK_SDK[LiveKit Client SDK]
        FE_AudioCap[WebAudio Capture]
        FE_TTS_Play[TTS Playback]

        FE_UI -- Activate --> FE_AudioCap;
        FE_AudioCap -- Audio Stream --> FE_LK_SDK;
        FE_LK_SDK -- Publishes User Audio Track --> LK_Server;
        LK_Server -- Subscribes Bot TTS Track --> FE_LK_SDK;
        FE_LK_SDK -- TTS Audio Stream --> FE_TTS_Play;
        FE_TTS_Play -- Playback --> FE_UI;
        FE_LK_SDK -- Connection Mgmt --> FE_UI;
    end

    subgraph Backend (Remix App + Services)
        BE_Token[LiveKit Token Endpoint]
        BE_Bot[Bot Participant Service]
        BE_ToolExec[Tool Execution Engine]

        FE_UI -- Request Token --> BE_Token;
        BE_Token -- Token/URL --> FE_UI;

        BE_Bot -- Joins Room --> LK_Server;
        LK_Server -- User Audio Track --> BE_Bot;
        BE_Bot -- Audio Data --> Rep_API;
        Rep_API -- NLU/Tool/Text --> BE_Bot;
        BE_Bot -- Tool Call Info --> BE_ToolExec;
        BE_ToolExec -- Executes --> Shopify_API[Shopify API];
        BE_Bot -- Text for TTS --> PlayHT_API;
        PlayHT_API -- TTS Audio Data/Stream --> BE_Bot;
        BE_Bot -- Publishes TTS Audio Track --> LK_Server;
    end

    subgraph External Services
        LK_Server[LiveKit Server]
        Rep_API[Replicate API / Ultravox]
        PlayHT_API[Play.ht Standard API]
    end

    style Rep_API fill:#f9f,stroke:#333,stroke-width:2px;
    style PlayHT_API fill:#ccf,stroke:#333,stroke-width:2px;
    style BE_Bot fill:#dff,stroke:#333,stroke-width:2px;