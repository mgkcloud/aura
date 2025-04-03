/**
 * LiveKit Voice Assistant Integration
 * 
 * This module provides a bridge between the LiveKit SDK
 * and the existing voice assistant frontend code.
 */

// --- Import LiveKit Client SDK ---
// Using the bundled version instead of bare import to avoid CORS issues
// The livekit-client.js file contains the bundled library
const LivekitClient = window.LivekitClient || {};
const { 
  Room,
  RoomEvent,
  // LocalAudioTrack, // createLocalAudioTrack is preferred for creating tracks
  ConnectionState,
  // Participant, // Room class provides participant access
  // RemoteParticipant, // Room class provides participant access
  Track,
  // TrackPublication, // Handled via Room events
  TrackEvent // Added for playback events
} = LivekitClient;


/**
 * Voice Assistant Integration using LiveKit
 * 
 * Main integration class that connects LiveKit audio to the voice assistant UI.
 */
export class VoiceAssistantIntegration {
  constructor(shopDomain) { 
    this.shopDomain = shopDomain;
    
    // LiveKit related properties
    this.livekitRoom = null;
    this.livekitUrl = null;
    this.livekitToken = null;
    this.localAudioTrack = null; // LiveKit LocalAudioTrack instance
    this.remoteAudioTracks = new Map(); // Map participant SID -> AudioTrack
    this.ttsAudioElement = null; // To play TTS
    
    // Visualization related properties
    this.onVisualizerDataCallback = null;
    this.visualizerInterval = null;
    this.audioContext = null; // For visualization analyser
    this.analyserNode = null;
    this.frequencyDataArray = null; // For visualization data

    // Make sure shopDomain doesn't include protocol (server expects just the domain)
    if (this.shopDomain) {
      // Remove any protocol prefix if present
      this.shopDomain = this.shopDomain.replace(/^https?:\/\//, '');
    }
    
    console.log('VoiceAssistantIntegration initialized with shop:', shopDomain);
  }

  /**
   * Fetch LiveKit connection details from the backend.
   * @returns {Promise<{livekitUrl: string, token: string}|null>}
   */
  async fetchLiveKitToken() {
    const fetchRequestId = `lk-token-${Date.now()}`;
    console.log(`[${fetchRequestId}] Fetching LiveKit token...`);
    try {
      // Use the dedicated token endpoint
      const tokenEndpoint = '/api/livekit/token'; 
      const queryParams = new URLSearchParams({ shop: this.shopDomain });
      const url = `${tokenEndpoint}?${queryParams.toString()}`;

      console.log(`[${fetchRequestId}] Requesting token from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        // Include credentials if your endpoint requires auth cookies/headers
        // credentials: 'include', 
      });

      console.log(`[${fetchRequestId}] Token endpoint response status: ${response.status}`);

      if (!response.ok) {
        let errorMsg = `Failed to fetch LiveKit token: ${response.status} ${response.statusText}`;
        try {
          const errorBody = await response.json();
          console.error(`[${fetchRequestId}] Error fetching token:`, errorBody);
          errorMsg = errorBody.error || errorMsg;
        } catch (e) {
          console.error(`[${fetchRequestId}] Could not parse error response body.`);
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (!data.livekitUrl || !data.token) {
        throw new Error('Invalid token response from server');
      }

      console.log(`[${fetchRequestId}] LiveKit URL and Token received successfully.`);
      this.livekitUrl = data.livekitUrl;
      this.livekitToken = data.token;
      return { livekitUrl: this.livekitUrl, token: this.livekitToken };

    } catch (error) {
      console.error(`[${fetchRequestId}] Error fetching LiveKit token:`, error);
      // Dispatch error event for UI feedback
      document.dispatchEvent(new CustomEvent('voice-assistant-error', {
        detail: {
          message: `Failed to get connection details: ${error.message}`,
          code: 'TOKEN_FETCH_FAILED',
          status: 500, 
        }
      }));
      return null;
    }
  }

  /**
   * Connect to the LiveKit room.
   */
  async connectToLiveKit() {
    const connectRequestId = `lk-conn-${Date.now()}`;
    console.log(`[${connectRequestId}] Attempting to connect to LiveKit...`);

    if (this.livekitRoom && (this.livekitRoom.state === ConnectionState.Connected || this.livekitRoom.state === ConnectionState.Connecting)) {
      console.log(`[${connectRequestId}] Already connected or connecting to LiveKit.`);
      return true;
    }

    // Ensure we have connection details
    if (!this.livekitUrl || !this.livekitToken) {
      const tokenData = await this.fetchLiveKitToken();
      if (!tokenData) {
        console.error(`[${connectRequestId}] Failed to get LiveKit token, cannot connect.`);
        return false;
      }
    }

    try {
      // Create Room instance
      this.livekitRoom = new Room({
        // Automatically manage subscribed video quality (not relevant here, but good practice)
        adaptiveStream: true,
        // Optimize settings for low-latency audio
        dynacast: true, 
        // Define audio capture defaults directly here
        audioCaptureDefaults: {
          sampleRate: 16000, // Optimal for speech recognition
          channelCount: 1,   // Mono audio for voice
          echoCancellation: true,
          noiseSuppression: true, // Consider using Krisp if licensed
          autoGainControl: true,
        },
        // Add Krisp noise suppression if available (requires separate setup/license)
        // noiseSuppression: new KrispNoiseFilter(),
      });

      // Setup Room event listeners
      this.setupLiveKitListeners(connectRequestId);

      console.log(`[${connectRequestId}] Connecting to LiveKit room: ${this.livekitUrl}`);
      await this.livekitRoom.connect(this.livekitUrl, this.livekitToken, {
        // Reconnect automatically if the connection drops
        autoSubscribe: true, // Subscribe to existing tracks automatically
      });

      console.log(`[${connectRequestId}] Successfully connected to LiveKit room. State: ${this.livekitRoom.state}`);
      
      // Publish local audio track after connection
      await this.publishLocalAudio(connectRequestId);
      
      // Trigger bot to join the room
      await this.triggerBotJoin(connectRequestId);

      return true;
    } catch (error) {
      console.error(`[${connectRequestId}] Error connecting to LiveKit:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      document.dispatchEvent(new CustomEvent('voice-assistant-error', {
        detail: {
          message: `LiveKit connection failed: ${errorMessage}`,
          code: 'LIVEKIT_CONN_FAILED',
          status: 500,
        }
      }));
      // Clean up partially connected room if necessary
      if (this.livekitRoom) {
        // Remove listeners before disconnecting to avoid state updates during cleanup
        this.livekitRoom.removeAllListeners(); 
        await this.livekitRoom.disconnect();
        this.livekitRoom = null;
      }
      return false;
    }
  }

  /**
   * Setup listeners for LiveKit Room events.
   */
  setupLiveKitListeners(requestId) {
    if (!this.livekitRoom) return;

    this.livekitRoom
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log(`[${requestId}/${this.livekitRoom.sid || 'NO_ROOM'}] LiveKit Connection State Changed: ${state}`);
        // Dispatch status updates to the UI
        let status = 'disconnected';
        let message = 'Disconnected';
        switch (state) {
          case ConnectionState.Connecting:
            status = 'connecting';
            message = 'Connecting to voice service...';
            break;
          case ConnectionState.Connected:
            status = 'connected';
            message = 'Connected';
            break;
          case ConnectionState.Disconnected:
            status = 'disconnected';
            message = 'Disconnected from voice service.';
            // Handle cleanup or potential reconnection logic here if needed
            this.handleDisconnection(requestId);
            break;
          case ConnectionState.Reconnecting:
            status = 'reconnecting';
            message = 'Connection lost, attempting to reconnect...';
            break;
        }
        document.dispatchEvent(new CustomEvent('voice-assistant-status', {
          detail: { status, message, state, timestamp: Date.now() }
        }));
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log(`[${requestId}/${this.livekitRoom.sid}] Track Subscribed: ${track.kind} from ${participant.identity} (SID: ${participant.sid})`);
        if (track.kind === Track.Kind.Audio && !participant.isLocal) {
          console.log(`[${requestId}] Subscribed to remote audio track from ${participant.identity}. Attaching for playback...`);
          this.handleRemoteAudioTrack(track, participant);
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        console.log(`[${requestId}/${this.livekitRoom.sid}] Track Unsubscribed: ${track.kind} from ${participant.identity}`);
        if (track.kind === Track.Kind.Audio && this.remoteAudioTracks.has(participant.sid)) {
          this.handleRemoteAudioTrackRemoval(track, participant);
        }
      })
      .on(RoomEvent.Disconnected, (reason) => {
        console.warn(`[${requestId}/${this.livekitRoom.sid || 'NO_ROOM'}] Disconnected from LiveKit. Reason: ${reason || 'Unknown'}`);
        // ConnectionStateChanged handles the primary disconnect logic and cleanup via handleDisconnection
      })
      .on(RoomEvent.Reconnecting, () => {
        console.warn(`[${requestId}/${this.livekitRoom.sid || 'NO_ROOM'}] Reconnecting to LiveKit...`);
        // ConnectionStateChanged handles this state update
      })
      .on(RoomEvent.Reconnected, () => {
        console.log(`[${requestId}/${this.livekitRoom.sid || 'NO_ROOM'}] Reconnected to LiveKit successfully.`);
        // ConnectionStateChanged handles this state update
      });
      // Add more listeners as needed (e.g., DataReceived, ParticipantConnected/Disconnected)
  }

  /**
   * Publish the local audio track to the LiveKit room.
   */
  async publishLocalAudio(requestId) {
    if (!this.livekitRoom || this.livekitRoom.state !== ConnectionState.Connected) {
      console.warn(`[${requestId}] Cannot publish audio, not connected to LiveKit.`);
      return;
    }
    if (this.localAudioTrack) {
        console.warn(`[${requestId}] Local audio track already published.`);
        return;
    }

    try {
      console.log(`[${requestId}] Creating and publishing local audio track...`);
      // Create audio track with specific constraints using the global LivekitClient
      this.localAudioTrack = await LivekitClient.createLocalAudioTrack({
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true, // Consider Krisp if licensed
        autoGainControl: true,
      });

      // Publish the track
      await this.livekitRoom.localParticipant.publishTrack(this.localAudioTrack, {
        name: 'user-audio', // Optional name
        source: Track.Source.Microphone,
      });

      console.log(`[${requestId}] Local audio track published successfully.`);

      // Start visualizer updates using the LiveKit track
      this.startVisualizerUpdates(); 

    } catch (error) {
      console.error(`[${requestId}] Error publishing local audio track:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      document.dispatchEvent(new CustomEvent('voice-assistant-error', {
        detail: {
          message: `Failed to publish audio: ${errorMessage}`,
          code: 'AUDIO_PUBLISH_FAILED',
        }
      }));
      // Clean up the track if created but failed to publish
      if (this.localAudioTrack) {
        this.localAudioTrack.stop();
        this.localAudioTrack = null;
      }
    }
  }

  /**
   * Handle subscribed remote audio tracks (e.g., TTS from Bot).
   */
  handleRemoteAudioTrack(track, participant) {
    // Assuming only one remote audio track (the bot's TTS) for now
    // If multiple bots/participants could send audio, logic needs adjustment
    console.log(`Handling remote audio track from ${participant.identity}`);
    
    // Create an audio element if it doesn't exist
    if (!this.ttsAudioElement) {
      this.ttsAudioElement = document.createElement('audio');
      this.ttsAudioElement.id = 'remote-tts-audio';
      // Add attributes like autoplay if needed, but manage playback carefully
      // this.ttsAudioElement.autoplay = true; 
      document.body.appendChild(this.ttsAudioElement); // Append somewhere, maybe hidden
      console.log('Created audio element for TTS playback.');
    }

    // Attach the track to the audio element
    track.attach(this.ttsAudioElement);
    this.remoteAudioTracks.set(participant.sid, track);

    // Optional: Add event listeners to the track or element for playback state
    track.on(TrackEvent.AudioPlaybackStarted, () => {
      console.log(`Audio playback started for track ${track.sid} from ${participant.identity}`);
      document.dispatchEvent(new CustomEvent('voice-assistant-status', {
        detail: { status: 'speaking', message: 'Assistant speaking...' }
      }));
    });
    track.on(TrackEvent.AudioPlaybackFailed, (error) => {
      console.error(`Audio playback failed for track ${track.sid}:`, error);
       document.dispatchEvent(new CustomEvent('voice-assistant-error', {
        detail: { message: 'Assistant audio playback failed.', code: 'TTS_PLAYBACK_FAILED' }
      }));
    });
    // Note: AudioPlaybackEnded might not fire reliably for streams. 
    // Need alternative way to detect end of speech if required.
    // Consider using track.on(TrackEvent.Ended) or monitoring audio levels.

    console.log(`Attached remote audio track ${track.sid} to element.`);
    
    // Attempt to play, might require user interaction first
    this.ttsAudioElement.play().catch(e => {
        console.warn('Audio playback failed, likely needs user interaction first:', e);
        // Optionally inform the user they might need to interact
        document.dispatchEvent(new CustomEvent('voice-assistant-status', {
            detail: { status: 'idle', message: 'Click/tap to enable audio playback.' }
        }));
    });
  }

  /**
   * Handle removal of remote audio tracks.
   */
  handleRemoteAudioTrackRemoval(track, participant) {
    console.log(`Detaching remote audio track ${track.sid} from ${participant.identity}`);
    track.detach(); // Detach from all elements
    this.remoteAudioTracks.delete(participant.sid);

    // Clean up the audio element if no more tracks are attached (optional)
    if (this.remoteAudioTracks.size === 0 && this.ttsAudioElement) {
      // Pause and reset the element for potential reuse
      this.ttsAudioElement.pause();
      this.ttsAudioElement.srcObject = null; 
      // Optionally remove the element:
      // this.ttsAudioElement.remove();
      // this.ttsAudioElement = null;
      console.log('Last remote audio track detached.');
    }
    // Update status only if no other remote tracks are playing
     if (this.remoteAudioTracks.size === 0) {
        document.dispatchEvent(new CustomEvent('voice-assistant-status', {
          detail: { status: 'idle', message: 'Assistant finished speaking.' }
        }));
     }
  }

  /**
   * Handle disconnection from LiveKit. Cleans up resources.
   */
  handleDisconnection(requestId) {
    console.log(`[${requestId}] Handling LiveKit disconnection cleanup.`);
    // Stop local track if it exists and is published
    if (this.localAudioTrack) {
      // Check if track is published before trying to unpublish (might already be stopped by disconnect)
      if (this.livekitRoom?.localParticipant?.isPublicationTrack(this.localAudioTrack)) {
         this.livekitRoom.localParticipant.unpublishTrack(this.localAudioTrack);
      }
      this.localAudioTrack.stop(); // Ensure track is stopped
      this.localAudioTrack = null;
      console.log(`[${requestId}] Stopped and cleaned up local audio track.`);
    }
    // Detach remote tracks
    this.remoteAudioTracks.forEach(track => track.detach());
    this.remoteAudioTracks.clear();
    console.log(`[${requestId}] Detached remote audio tracks.`);

    // Clean up audio element (optional)
    if (this.ttsAudioElement) {
      this.ttsAudioElement.pause();
      this.ttsAudioElement.srcObject = null;
      // Optionally remove:
      // this.ttsAudioElement.remove(); 
      // this.ttsAudioElement = null;
    }

    // Stop visualizer and clean up its resources
    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
      this.visualizerInterval = null;
      console.log(`[${requestId}] Stopped visualizer updates.`);
    }
     if (this.analyserNode) {
        try { this.analyserNode.disconnect(); } catch(e){}
        this.analyserNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close().catch(e => console.warn(`[${requestId}] Error closing visualizer AudioContext during disconnect:`, e));
        this.audioContext = null;
    }
    this.frequencyDataArray = null;


    this.livekitRoom = null; // Clear the room reference
    // Keep token/url for potential reconnect attempts? Or clear them?
    // this.livekitUrl = null;
    // this.livekitToken = null;
  }

  
  /**
   * Start listening: Connect to LiveKit and publish audio.
   * Returns true if successfully started.
   */
  async startListening() {
    const startRequestId = `start-${Date.now()}`;
    console.log(`[${startRequestId}] Starting listening process...`);
    try {
      // Connect to LiveKit (handles token fetching and audio publishing internally)
      const success = await this.connectToLiveKit();

      if (!success) {
        console.error(`[${startRequestId}] Failed to connect to LiveKit.`);
        // Error handling (dispatching event) is done within connectToLiveKit
        return false;
      }

      console.log(`[${startRequestId}] Listening started successfully (Connected to LiveKit).`);
      // Visualizer updates are started within publishLocalAudio after the track is created.
      
      return true;
    } catch (error) {
      console.error(`[${startRequestId}] Error during startListening:`, error);
      // Ensure cleanup if something unexpected happens at this top level
      await this.stopListening(); 
      return false;
    }
  }
  
  /**
   * Stop listening: Disconnect from LiveKit and clean up resources.
   */
  async stopListening() { // Make async as disconnect is async
    const requestId = this.livekitRoom?.sid || 'N/A'; // Use room SID for logging if available
    console.log(`[${requestId}] Stopping listening process...`);

    // Disconnect from LiveKit room (this triggers cleanup via listeners if they haven't been removed)
    if (this.livekitRoom) {
      // Remove listeners before disconnecting to prevent state updates during manual disconnect
      // and ensure our manual cleanup runs correctly.
      this.livekitRoom.removeAllListeners(); 
      await this.livekitRoom.disconnect(true); // Pass true to stop tracks
      console.log(`[${requestId}] Disconnect requested from LiveKit room.`);
    } else {
       console.log(`[${requestId}] No active LiveKit room to disconnect.`);
    }
    
    // Manually ensure cleanup, as listeners might have been removed or disconnect might not fire them reliably
    this.handleDisconnection(requestId); 

    console.log(`[${requestId}] Voice assistant stopped listening.`);
  }
  
  /**
   * Set a callback to receive audio data for visualization.
   */
  setVisualizerDataCallback(callback) {
    console.log('Setting visualizer data callback.');
    this.onVisualizerDataCallback = callback;
  }
  
  /**
   * Set microphone gain (boost).
   * NOTE: LiveKit's SDK manages gain automatically by default (autoGainControl). 
   * Manual gain adjustment might interfere or be unnecessary.
   * This method is kept for potential future use but might not be needed.
   * @param gain - Gain value (1.0 is normal, >1.0 boosts volume)
   */
  setMicrophoneGain(gain) {
    console.warn(`Setting microphone gain manually (${gain}). LiveKit SDK might override this with autoGainControl.`);
    if (this.localAudioTrack && this.localAudioTrack.mediaStreamTrack) {
        // Accessing underlying track settings is complex and might not be reliable.
        // Consider disabling autoGainControl in createLocalAudioTrack if manual control is essential.
        console.log('Manual gain setting on LiveKit track is not directly supported via this method.');
    }
  }
  
  /**
   * Start updating the visualizer with real audio data from the LiveKit track.
   */
  startVisualizerUpdates() {
    const requestId = this.livekitRoom?.sid || 'N/A';
    console.log(`[${requestId}] Starting visualizer updates.`);

    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
      this.visualizerInterval = null; // Ensure it's cleared before potentially returning
    }

    if (!this.localAudioTrack || !this.localAudioTrack.mediaStreamTrack || this.localAudioTrack.isMuted) {
        console.warn(`[${requestId}] Cannot start visualizer: Local audio track not available or track is stopped/muted.`);
        return;
    }

    try {
        // Create AudioContext and AnalyserNode if they don't exist or are closed
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`[${requestId}] Created visualizer AudioContext.`);
        }
        if (!this.analyserNode) {
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 256; // Standard size for visualization
            // Ensure frequencyDataArray matches the bin count
            this.frequencyDataArray = new Uint8Array(this.analyserNode.frequencyBinCount); 
            console.log(`[${requestId}] Created visualizer AnalyserNode (frequencyBinCount: ${this.analyserNode.frequencyBinCount}).`);
        } else {
             // Ensure analyser is connected if it already exists but track was republished
             try { this.analyserNode.disconnect(); } catch(e){} // Disconnect previous source if any
        }

        // Connect the LiveKit track's MediaStreamTrack to the analyser
        // Important: Create a new MediaStream with the track for the source node
        const sourceNode = this.audioContext.createMediaStreamSource(new MediaStream([this.localAudioTrack.mediaStreamTrack]));
        sourceNode.connect(this.analyserNode);
        console.log(`[${requestId}] Connected local audio track to visualizer AnalyserNode.`);

        this.visualizerInterval = setInterval(() => {
          // Add checks inside interval as well, in case track/context gets cleaned up
          if (!this.onVisualizerDataCallback || !this.analyserNode || !this.frequencyDataArray || !this.localAudioTrack || this.localAudioTrack.isMuted) {
              if(this.visualizerInterval) clearInterval(this.visualizerInterval);
              this.visualizerInterval = null;
              console.log(`[${requestId}] Stopping visualizer interval due to missing prerequisites or muted track.`);
              return;
          }

          try {
            // Get frequency data from the analyser node
            this.analyserNode.getByteFrequencyData(this.frequencyDataArray);
            // Pass a copy to prevent modification issues if callback is async
            this.onVisualizerDataCallback(new Uint8Array(this.frequencyDataArray)); 
          } catch (error) {
              console.error(`[${requestId}] Error getting frequency data:`, error);
              // Stop interval on error to prevent flooding logs
              if(this.visualizerInterval) clearInterval(this.visualizerInterval);
              this.visualizerInterval = null;
          }

        }, 100); // Update 10 times per second

    } catch (error) {
        console.error(`[${requestId}] Error setting up visualizer:`, error);
        if (this.visualizerInterval) {
            clearInterval(this.visualizerInterval);
            this.visualizerInterval = null;
        }
        // Clean up context/node if creation failed partially
        if (this.analyserNode) {
            try { this.analyserNode.disconnect(); } catch(e){}
            this.analyserNode = null;
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(e => console.warn('Error closing context after visualizer setup error:', e));
            this.audioContext = null;
        }
        this.frequencyDataArray = null;
    }
  }

  /**
   * Trigger the bot to join the room.
   * Called after the user successfully connects to LiveKit.
   */
  async triggerBotJoin(requestId) {
    if (!this.livekitRoom) {
      console.warn(`[${requestId}] Cannot trigger bot join, no active LiveKit room.`);
      return false;
    }
    
    try {
      const roomName = this.livekitRoom.name;
      console.log(`[${requestId}] Triggering bot to join room: ${roomName}`);
      
      const botEndpoint = '/api/livekit/bot';
      const response = await fetch(botEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          action: 'join',
          roomName: roomName,
        }),
      });
      
      if (!response.ok) {
        let errorMsg = `Failed to trigger bot join: ${response.status} ${response.statusText}`;
        try {
          const errorBody = await response.json();
          errorMsg = errorBody.error || errorMsg;
        } catch (e) {
          console.error(`[${requestId}] Could not parse error response from bot endpoint.`);
        }
        console.error(`[${requestId}] ${errorMsg}`);
        return false;
      }
      
      const result = await response.json();
      console.log(`[${requestId}] Bot join triggered successfully: ${result.message}`);
      
      // Update status to let user know the assistant is joining
      document.dispatchEvent(new CustomEvent('voice-assistant-status', {
        detail: { 
          status: 'ready', 
          message: 'Voice assistant connected and ready',
          timestamp: Date.now()
        }
      }));
      
      return true;
    } catch (error) {
      console.error(`[${requestId}] Error triggering bot join:`, error);
      return false;
    }
  }

} // End of VoiceAssistantIntegration class

// Expose to window for script tag loading
if (typeof window !== 'undefined') {
  window.VoiceAssistantIntegration = VoiceAssistantIntegration;
  // LiveKitAudioClient class is removed
}