/**
 * LiveKit Voice Assistant Integration
 * 
 * This module provides a bridge between our improved LiveKit audio implementation
 * and the existing voice assistant frontend code.
 */

// --- Import LiveKit Client SDK ---
// Using the bundled version instead of bare import to avoid CORS issues
// The livekit-client.js file contains the bundled library
const LivekitClient = window.LivekitClient || {};
const { 
  Room,
  RoomEvent,
  LocalAudioTrack,
  ConnectionState,
  Participant,
  RemoteParticipant,
  Track,
  TrackPublication
} = LivekitClient;

// First, let's implement the LiveKitAudioClient
class LiveKitAudioClient {
  constructor(audioConfig = {}) {
    this.audioConfig = {
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      sampleRate: 16000, // Optimal for speech recognition
      channelCount: 1,   // Mono audio for voice
      ...audioConfig
    };
    
    this.isRecording = false;
    this.mediaStream = null;
    this.audioContext = null;
    this.gainNode = null;
    this.volumeAnalyser = null;
    this.volumeDataArray = null;
    this.frequencyDataArray = null;
    this.volumeInterval = null;
  }

  /**
   * Start audio capture with optimal settings for voice
   * Returns true if successfully started
   */
  async startAudio() {
    if (this.isRecording) {
      return true;
    }

    try {
      // Request microphone access with optimized constraints for voice
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: this.audioConfig.echoCancellation,
          noiseSuppression: this.audioConfig.noiseSuppression,
          autoGainControl: this.audioConfig.autoGainControl,
          sampleRate: this.audioConfig.sampleRate,
          channelCount: this.audioConfig.channelCount,
        } 
      });

      // Initialize audio context and processing
      await this.setupAudioProcessing();

      this.isRecording = true;
      return true;
    } catch (error) {
      console.error('Failed to create audio track:', error);
      return false;
    }
  }

  async setupAudioProcessing() {
    if (!this.mediaStream) return;

    try {
      // Initialize Web Audio API components
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.audioConfig.sampleRate || 16000, // Ensure correct sample rate
      });

      // Set up volume and frequency analysis
      this.setupAudioAnalysis();
    } catch (error) {
      console.error('Failed to set up audio processing:', error);
    }
  }

  setupAudioAnalysis() {
    if (!this.audioContext || !this.mediaStream) return;

    try {
      // Create source node from the MediaStream
      const sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create analyzer node for volume and frequency monitoring
      this.volumeAnalyser = this.audioContext.createAnalyser();
      this.volumeAnalyser.fftSize = 256; // Must be power of 2
      
      // Create data arrays for analysis
      this.volumeDataArray = new Uint8Array(this.volumeAnalyser.frequencyBinCount);
      this.frequencyDataArray = new Uint8Array(128); // For visualization compatibility

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0; // Default gain

      // Connect the nodes: source -> gain -> analyzer
      sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.volumeAnalyser);

      // Start audio monitoring
      this.startAudioMonitoring();
    } catch (error) {
      console.error('Failed to setup audio analysis:', error);
    }
  }

  startAudioMonitoring() {
    if (!this.volumeAnalyser || !this.volumeDataArray || this.volumeInterval) return;

    this.volumeInterval = setInterval(() => {
      if (!this.volumeAnalyser || !this.volumeDataArray || !this.frequencyDataArray) return;

      // Get frequency data for visualization
      this.volumeAnalyser.getByteFrequencyData(this.volumeDataArray);
      
      // Process data for volume level
      let sum = 0;
      for (let i = 0; i < this.volumeDataArray.length; i++) {
        sum += this.volumeDataArray[i];
      }
      sum / this.volumeDataArray.length;
      
      // Prepare frequency data for visualization (resize to match expected format)
      // This ensures compatibility with the existing visualizer
      const ratio = Math.floor(this.volumeDataArray.length / this.frequencyDataArray.length);
      for (let i = 0; i < this.frequencyDataArray.length; i++) {
        let sum = 0;
        for (let j = 0; j < ratio; j++) {
          sum += this.volumeDataArray[i * ratio + j] || 0;
        }
        this.frequencyDataArray[i] = sum / ratio;
      }
    }, 100); // Update every 100ms
  }

  /**
   * Get frequency data array for visualization
   * Compatible with the existing visualizer
   */
  getFrequencyData() {
    return this.frequencyDataArray;
  }

  /**
   * Stop the audio capture
   */
  stopAudio() {
    // Clean up media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    this.isRecording = false;
    this.cleanupAudioResources();
  }
  
  /**
   * Boost the microphone level
   * @param gain - Gain value (1.0 is normal, >1.0 boosts volume)
   */
  setMicrophoneGain(gain) {
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(gain, this.audioContext.currentTime);
    }
  }

  /**
   * Get raw audio data for sending to server
   * Returns base64 encoded audio data
   */
  async getAudioChunk() {
    if (!this.mediaStream) return null;
    
    try {
      return new Promise((resolve, reject) => {
        const chunks = [];
        
        // Use the preferred mime type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
          
        const recorder = new MediaRecorder(this.mediaStream, { mimeType });
        
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        
        recorder.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
            const reader = new FileReader();
            
            reader.onloadend = () => {
              const base64data = reader.result?.toString().split(',')[1];
              resolve(base64data || null);
            };
            
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          } catch (e) {
            reject(e);
          }
        };
        
        // Record a short chunk
        recorder.start();
        
        // Stop after a short time
        setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, 250); // 250ms chunk
      });
    } catch (error) {
      console.error('Error getting audio chunk:', error);
      return null;
    }
  }

  /**
   * Clean up all audio resources
   */
  cleanupAudioResources() {
    // Stop volume monitoring
    if (this.volumeInterval) {
      clearInterval(this.volumeInterval);
      this.volumeInterval = null;
    }

    // Clean up audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close().catch(e => console.warn('Error closing AudioContext:', e));
      } catch (e) {
        console.warn('Error closing AudioContext:', e);
      }
      this.audioContext = null;
    }

    // Reset audio processing nodes
    this.gainNode = null;
    this.volumeAnalyser = null;
    this.volumeDataArray = null;
    this.frequencyDataArray = null;
  }
  
  /**
   * Check if audio is currently recording
   */
  isActive() {
    return this.isRecording;
  }
}

/**
 * Voice Assistant Integration
 * 
 * Main integration class that connects LiveKit audio to the voice assistant
 */
class VoiceAssistantIntegration {
  constructor(shopDomain, audioConfig) {
    this.shopDomain = shopDomain;
    
    // SSE streaming endpoint (query params will be added when connecting)
    this.sseEndpoint = '/apps/voice';
    
    // POST endpoint for audio data
    this.apiEndpoint = '/apps/voice';
    
    this.currentRequestId = null;
    this.currentChunkNumber = 0;
    this.onVisualizerDataCallback = null;
    this.visualizerInterval = null;
    this.wsConnection = null; // Holds the EventSource object
    this.sessionId = null; // Stores the session ID received from the server
    this.reconnectAttempts = 0; // Track reconnection attempts
    this.maxReconnectAttempts = 5; // Max times to try reconnecting
    this.reconnectDelay = 1000; // Initial reconnect delay in ms
    
    // Initialize LiveKit client with optimized audio settings
    this.liveKitAudioClient = new LiveKitAudioClient(audioConfig);
    
    // Make sure shopDomain doesn't include protocol (server expects just the domain)
    if (this.shopDomain) {
      // Remove any protocol prefix if present
      this.shopDomain = this.shopDomain.replace(/^https?:\/\//, '');
    }
    
    console.log('VoiceAssistantIntegration initialized with shop:', shopDomain);
    console.log('Using SSE streaming endpoint:', this.sseEndpoint);
    console.log('Using API endpoint:', this.apiEndpoint);
  }
  
  /**
   * Start listening with improved audio processing
   * Returns true if successfully started
   */
  async startListening() {
    try {
      // Generate a unique request ID for this session
      this.currentRequestId = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      console.log(`[${this.currentRequestId}] Starting listening process...`);
      
      // Connect to SSE before starting audio
      const sseSuccess = await this.connectSSE();
      if (!sseSuccess) {
        console.error(`[${this.currentRequestId}] Failed to establish initial SSE connection.`);
        return false;
      }
      
      // Start audio capture
      const success = await this.liveKitAudioClient.startAudio();
      if (!success) {
        return false;
      }
      
      // Start sending audio chunks to server
      this.startSendingAudioChunks();
      
      console.log(`[${this.currentRequestId}] Listening started successfully.`);
      // Start feeding visualizer data
      this.startVisualizerUpdates();
      
      return true;
    } catch (error) {
      console.error(`[${this.currentRequestId}] Error during startListening:`, error);
      return false;
    }
  }
  
  /**
   * Connect to server via SSE (Server-Sent Events)
   * Uses Shopify app proxy path with enhanced diagnostics and error handling
   * @returns {Promise<boolean>} Success status
   */
  async connectSSE() {
    const connectRequestId = `sse-conn-${Date.now()}`;
    console.log(`[${connectRequestId}] Attempting to connect SSE...`);
    return new Promise(async (resolve) => {
      try {
        // Add diagnostic info for troubleshooting
        const diagnosticInfo = {
          locationHref: window.location.href,
          locationOrigin: window.location.origin,
          referrer: document.referrer,
          shopDomain: this.shopDomain,
          userAgent: navigator.userAgent,
          timestamp: Date.now()
        };
        console.log('Connection diagnostic information:', diagnosticInfo);

        // Close existing connection if any
        if (this.wsConnection) {
          console.log(`[${connectRequestId}] Closing existing EventSource connection (readyState: ${this.wsConnection.readyState})`);
          this.wsConnection.close();
          this.wsConnection = null;
        }
        
        // ONLY use the Shopify app proxy path - no fallbacks
        // This ensures we go through the proper proxy route
        const endpoint = '/apps/voice';
        console.log(`[${connectRequestId}] Establishing SSE connection via Shopify app proxy path: ${endpoint}`);
        
        // Create URL with proper parameters using URLSearchParams
        const timestamp = Date.now();
        
        // Build query parameters correctly
        const queryParams = new URLSearchParams();
        queryParams.append('stream', 'true');
        queryParams.append('shop', this.shopDomain);
        
        // Include session ID if we have one from previous connection
        if (this.sessionId) {
          console.log(`[${connectRequestId}] Attempting to reconnect with existing session ID: ${this.sessionId}`);
          queryParams.append('sessionId', this.sessionId);
        }
        
        // Add timestamp to prevent caching
        queryParams.append('t', timestamp.toString());
        
        // Build the full URL
        const sseUrl = `${endpoint}?${queryParams.toString()}`;
        console.log(`[${connectRequestId}] Constructed SSE URL: ${sseUrl}`);
          
          // Test connection with fetch first for diagnostic purposes
          try {
            const testResponse = await fetch(sseUrl, { 
              method: 'GET', 
              credentials: 'include',
              headers: { 'Accept': 'text/event-stream' }
            });
            
            console.log(`[${connectRequestId}] Diagnostic fetch response: ${testResponse.status} ${testResponse.statusText}`);
            console.log(`[${connectRequestId}] Diagnostic fetch response headers:`, Object.fromEntries(testResponse.headers.entries()));
            
            // If response doesn't have proper SSE content type, this endpoint might not support SSE
            if (!testResponse.headers.get('content-type')?.includes('text/event-stream')) {
              console.warn(`[${connectRequestId}] Warning: Diagnostic fetch to ${endpoint} did not return 'text/event-stream' content type. Proceeding with EventSource anyway...`);
            }
          } catch (fetchError) {
            // Log but continue since some browsers block fetch but allow EventSource
            console.warn(`[${connectRequestId}] Diagnostic fetch failed for ${endpoint}:`, fetchError);
          }
          
          // Set a success flag to track if this endpoint works
          let connectionSuccess = false;
          
          // Create EventSource to establish SSE connection
          try {
            // Create EventSource with withCredentials option to allow cookies
            const eventSource = new EventSource(sseUrl, { withCredentials: true });
            
            console.log(`[${connectRequestId}] EventSource created for ${sseUrl}. Initial readyState: ${eventSource.readyState}`);
            
            // Track connection states and timeout
            let isConnected = false;
            let receivedSessionId = null; // Use a local var to avoid race conditions with this.sessionId
            const connectionTimeout = setTimeout(() => {
              if (!isConnected) {
                console.warn(`[${connectRequestId}] SSE connection attempt timed out after 5 seconds for ${endpoint}. Closing EventSource.`);
                eventSource.close();
                resolve(false); // Resolve as failure on timeout
              }
            }, 5000);
            
            // Handle built-in open event (connection established)
            eventSource.onopen = () => {
              console.log(`[${connectRequestId}] EventSource onopen event fired. readyState: ${eventSource.readyState}`);
              
              // Mark as connected via the built-in event
              if (!isConnected) {
                console.log(`[${connectRequestId}] Setting connected state based on 'onopen' event.`);
                isConnected = true;
                this.wsConnection = eventSource;
                connectionSuccess = true;
                this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
                
                // Always clear the timeout when connected
                clearTimeout(connectionTimeout);
                
                // Give custom events a chance to process before resolving
                // Resolve immediately if we already got a session ID from a custom event
                if (receivedSessionId) {
                   console.log(`[${connectRequestId}] Connection open and session ID already received. Resolving.`);
                   resolve(true);
                } else {
                    setTimeout(() => {
                      if (!receivedSessionId) {
                        console.log(`[${connectRequestId}] Connection open, but no session ID received via custom 'open' event yet. Resolving as connected.`);
                        resolve(true); // Still resolve, session ID might come later or not be needed immediately
                      }
                    }, 500);
                }
              }
            };
            
            // Connection state handlers with improved error handling and logging
            
            // Track which event established the connection to prevent duplicates
            let connectionEstablished = false;
            
            // --- Custom Event Listeners ---
            
            // Handle the 'open' custom event (not the same as onopen built-in event)
            // This is sent immediately after the connection is established
            eventSource.addEventListener('open', (event) => {
              console.log(`[${connectRequestId}] Received custom 'open' event.`);
              try {
                // Safe data parsing with extensive error handling
                if (!event.data) {
                  console.warn(`[${connectRequestId}] Custom 'open' event received with empty data.`);
                  return;
                }
                
                let data;
                try {
                  data = JSON.parse(event.data);
                  console.log('SSE session established via custom open:', data);
                } catch (parseError) {
                  console.error(`[${connectRequestId}] Error parsing custom 'open' event data:`, parseError);
                  console.error(`[${connectRequestId}] Raw 'open' event data:`, event.data);
                  return;
                }
                
                // Extract and store session ID for reconnection
                if (data.sessionId) {
                  receivedSessionId = data.sessionId;
                  this.sessionId = receivedSessionId; // Update the instance variable
                  console.log(`[${connectRequestId}] Session ID received via 'open' event: ${receivedSessionId}`);
                }
                
                // Only establish the connection once
                if (!connectionEstablished && !isConnected) {
                  console.log(`[${connectRequestId}] Setting connected state based on custom 'open' event.`);
                  isConnected = true;
                  connectionEstablished = true;
                  this.wsConnection = eventSource;
                  connectionSuccess = true;
                  this.reconnectAttempts = 0; // Reset reconnect attempts
                  clearTimeout(connectionTimeout); // Clear timeout as we are connected
                  
                  // Resolve the promise to indicate successful connection
                  resolve(true);
                }
              } catch (error) {
                console.error(`[${connectRequestId}] Error handling custom 'open' event:`, error);
              }
            });
            
            // Handle ready event (connection fully established and ready for data)
            eventSource.addEventListener('ready', (event) => { // This listener seems redundant with 'open' and built-in onopen, consider removing if not needed by server
              console.log(`[${connectRequestId}] Received custom 'ready' event.`);
              
              // Only establish the connection once if not already done
              if (!connectionEstablished && !isConnected) {
                console.log(`[${connectRequestId}] Setting connected state based on custom 'ready' event.`);
                isConnected = true;
                connectionEstablished = true;
                this.wsConnection = eventSource;
                connectionSuccess = true;
                this.reconnectAttempts = 0; // Reset reconnect attempts
                clearTimeout(connectionTimeout); // Clear timeout
                resolve(true);
              }
            });
            
            // Handle heartbeat events - used to keep the connection alive
            eventSource.addEventListener('heartbeat', (event) => {
              const timestamp = event.data ? JSON.parse(event.data)?.timestamp : Date.now();
              console.debug(`[${connectRequestId}/${this.sessionId || 'NO_SESSION'}] Received 'heartbeat' event at ${new Date(timestamp).toISOString()}`);
            });
            
            // Handle standard messages (fallback for miscellaneous events)
            eventSource.addEventListener('message', (event) => {
              console.log(`[${connectRequestId}/${this.sessionId || 'NO_SESSION'}] Received generic 'message' event.`);
              console.debug(`[${connectRequestId}] Raw generic 'message' data:`, event.data);
              
              try {
                // Safe data parsing with validation
                if (!event.data) {
                  console.warn(`[${connectRequestId}] Generic 'message' event received with empty data.`);
                  return;
                }
                
                let data;
                try {
                  data = JSON.parse(event.data);
                  console.log('Parsed message data:', data);
                } catch (parseError) {
                  console.error(`[${connectRequestId}] Error parsing generic 'message' event data:`, parseError);
                  console.error(`[${connectRequestId}] Raw generic 'message' data:`, event.data);
                  return;
                }
                
                // Handle connection confirmation
                if (data.type === 'connected') {
                  console.log(`[${connectRequestId}] Received explicit 'connected' message.`);
                  
                  // Only establish the connection once if not already done
                  if (!connectionEstablished && !isConnected) {
                    console.log(`[${connectRequestId}] Setting connected state based on 'connected' message.`);
                    isConnected = true;
                    connectionEstablished = true;
                    this.wsConnection = eventSource;
                    connectionSuccess = true;
                    this.reconnectAttempts = 0; // Reset reconnect attempts
                    clearTimeout(connectionTimeout); // Clear timeout
                    resolve(true);
                  }
                }
                
                // Process result messages that might come through the generic channel
                if (data.message && !data.type) {
                  console.log(`[${connectRequestId}] Received assistant response via generic 'message' event:`, data);
                  
                  // Dispatch to the main application
                  document.dispatchEvent(new CustomEvent('voice-assistant-response', {
                    detail: data
                  }));
                }
              } catch (error) {
                console.error(`[${connectRequestId}] Error processing generic 'message' event:`, error);
              }
            });
            
            // Handle specific result events - these contain the assistant's response
            eventSource.addEventListener('result', (event) => {
              console.log(`[${connectRequestId}/${this.sessionId || 'NO_SESSION'}] Received dedicated 'result' event.`);
              console.debug(`[${connectRequestId}] Raw 'result' data:`, event.data);
              
              try {
                // Safe data parsing with validation
                if (!event.data) {
                  console.warn(`[${connectRequestId}] Dedicated 'result' event received with empty data.`);
                  return;
                }
                
                let result;
                try {
                  result = JSON.parse(event.data);
                  console.log('Parsed result data:', result);
                } catch (parseError) {
                  console.error(`[${connectRequestId}] Error parsing dedicated 'result' event data:`, parseError);
                  console.error(`[${connectRequestId}] Raw 'result' data:`, event.data);
                  return;
                }
                
                // Dispatch the result to the main application
                document.dispatchEvent(new CustomEvent('voice-assistant-response', {
                  detail: result
                }));
              } catch (error) {
                console.error(`[${connectRequestId}] Error processing dedicated 'result' event:`, error);
              }
            });
            
            // Enhanced error handling with detailed diagnostics and recovery
            eventSource.addEventListener('error', (event) => {
              console.error(`[${connectRequestId}/${this.sessionId || 'NO_SESSION'}] Received custom 'error' event on ${endpoint}:`, event);
              
              // Gather comprehensive diagnostic information
              const errorInfo = {
                readyState: eventSource.readyState, // 0=connecting, 1=open, 2=closed
                url: sseUrl,
                endpoint: endpoint,
                timestamp: Date.now(),
                shopDomain: this.shopDomain,
                sessionId: this.sessionId || null,
                connectionEstablished,
                isConnected,
                browserInfo: {
                  userAgent: navigator.userAgent,
                  platform: navigator.platform,
                  vendor: navigator.vendor,
                  language: navigator.language
                }
              };
              console.error('Full error diagnostic info:', errorInfo);

              // Extract error message with better parsing
              let errorMessage = 'Connection error';
              let errorCode = 'CONN_ERROR';
              let status = 500;
              
              try {
                if (event.data) {
                  try {
                    const errorData = JSON.parse(event.data);
                    errorMessage = errorData.message || errorMessage;
                    errorCode = errorData.code || errorCode; // Use server-provided code if available
                    status = errorData.status || status;
                    console.log('Parsed error data:', errorData);
                  } catch (parseError) {
                    console.error(`[${connectRequestId}] Custom 'error' event data not valid JSON:`, event.data);
                    // Use the raw data if it's not JSON
                    if (typeof event.data === 'string') {
                      errorMessage = event.data;
                    }
                  }
                }
              } catch (error) {
                console.error(`[${connectRequestId}] Error extracting details from custom 'error' event:`, error);
              }
              
              // Dispatch detailed error event
              document.dispatchEvent(new CustomEvent('voice-assistant-error', {
                detail: {
                  message: errorMessage,
                  code: errorCode,
                  status: status,
                  timestamp: Date.now(),
                  diagnostics: errorInfo
                }
              }));
            });
            
            // Enhanced generic error handler via onerror
            eventSource.onerror = (error) => {
              console.error(`[${connectRequestId}] EventSource built-in 'onerror' event fired for ${endpoint}. readyState: ${eventSource.readyState}`, error);
              
              // Classify error by connection state
              const connectionState = eventSource.readyState;
              let errorType;
              
              switch (connectionState) {
                case 0: // CONNECTING
                  errorType = 'connection_failed';
                  break;
                case 1: // OPEN
                  errorType = 'connection_interrupted';
                  break;
                case 2: // CLOSED
                  errorType = 'connection_closed';
                  break;
                default:
                  errorType = 'unknown_error';
              }
              
              console.error(`Connection error type: ${errorType} (readyState: ${connectionState})`);
              
              // Clear timeout if it hasn't fired
              clearTimeout(connectionTimeout);
              
              // Clean up if this was our active connection
              if (this.wsConnection === eventSource) {
                console.log(`[${connectRequestId}] Clearing active connection reference after onerror.`);
                this.wsConnection = null;
              }
              
              // Handle different error scenarios
              if (!connectionSuccess && !isConnected) {
                // Connection never established
                console.error(`[${connectRequestId}] Connection failed to establish (onerror). Closing EventSource.`);
                eventSource.close();
                
                // Attempt reconnection
                attemptReconnect(); // Start reconnection attempts
                
              } else if (isConnected) {
                // We lost an established connection
                console.error(`[${connectRequestId}] Established connection lost (onerror).`);
                
                // Dispatch connection lost error
                document.dispatchEvent(new CustomEvent('voice-assistant-error', {
                  detail: {
                    message: 'Connection to voice service was lost. Attempting to reconnect...',
                    code: 'CONNECTION_LOST',
                    status: 503,
                    type: errorType,
                    timestamp: Date.now(),
                    sessionId: this.sessionId
                  }
                }));
                
                // Keep the session ID for potential reconnection
                console.log(`[${connectRequestId}] Preserving session ID ${this.sessionId} for reconnection attempt.`);
                
                // Attempt reconnection if connection was previously established
                eventSource.close(); // Ensure it's closed before retrying
                attemptReconnect();
              }
            };
            
            // Function to attempt reconnection with exponential backoff
            const attemptReconnect = async () => { // Make async to await connectSSE
              this.reconnectAttempts++;
              
              if (this.reconnectAttempts > this.maxReconnectAttempts) {
                console.error(`[${connectRequestId}] Maximum reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
                resolve(false); // Failed to connect after retries
                
                // Dispatch final connection failure
                document.dispatchEvent(new CustomEvent('voice-assistant-error', {
                  detail: {
                    message: `Unable to establish connection after ${this.maxReconnectAttempts} attempts. Please try again later.`,
                    code: 'MAX_RETRIES_EXCEEDED',
                    status: 500,
                    timestamp: Date.now()
                  }
                }));
                return;
              }
              
              // Calculate backoff with jitter
              const baseDelay = Math.min(30000, this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)); // Max 30s delay
              const jitter = baseDelay * 0.1 * Math.random(); // Add +/- 10% jitter
              const delay = Math.max(1000, baseDelay + jitter); // Ensure minimum 1s delay
              
              console.warn(`[${connectRequestId}] SSE connection failed. Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${Math.round(delay / 1000)}s...`);
              
              // Create user feedback about reconnection
              document.dispatchEvent(new CustomEvent('voice-assistant-status', {
                detail: {
                  status: 'reconnecting',
                  message: `Reconnecting (attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts})...`,
                  attempt: this.reconnectAttempts,
                  maxAttempts: this.maxReconnectAttempts,
                  delay: delay,
                  timestamp: Date.now()
                }
              }));
              
              // Schedule the retry
              setTimeout(() => {
                console.log(`[${connectRequestId}] Executing reconnect attempt ${this.reconnectAttempts}...`);
                this.connectSSE().then(success => { // Call connectSSE again
                  if (success) {
                    console.log(`[${connectRequestId}] SSE reconnected successfully after ${this.reconnectAttempts} attempts.`);
                    resolve(true); // Resolve the original promise on success
                  } else {
                    // Failure is handled by the next onerror/timeout in the new connectSSE call
                    // If max attempts are reached there, it will resolve(false)
                  }
                });
              }, delay);
            };

          } catch (eventSourceError) {
            console.error(`[${connectRequestId}] Error creating EventSource:`, eventSourceError);

            // Log detailed error for debugging
            console.error('Error details:', {
              name: eventSourceError.name,
              message: eventSourceError.message,
              stack: eventSourceError.stack,
              endpoint: endpoint
            });
            
            // Attempt reconnection if creating EventSource fails
            attemptReconnect(); 
          }
        
      } catch (error) {
        console.error(`[${connectRequestId}] Unexpected error in connectSSE method:`, error);
        resolve(false);
      }
    });
  }
  
  /**
   * Stop listening and clean up resources
   */
  stopListening() {
    const requestId = this.currentRequestId || 'N/A';
    console.log(`[${requestId}] Stopping listening process...`);
    // Stop audio and clean up resources
    this.liveKitAudioClient.stopAudio();
    console.log(`[${requestId}] Stopped LiveKit audio client.`);
    
    // Close SSE/WebSocket connection
    if (this.wsConnection) {
      this.wsConnection.close();
      console.log(`[${requestId}] Closed SSE connection (readyState: ${this.wsConnection?.readyState})`);
      this.wsConnection = null;
    }
    
    // Clear intervals
    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
      console.log(`[${requestId}] Stopped visualizer updates.`);
      this.visualizerInterval = null;
    }
    
    // Reset request data
    this.currentRequestId = null;
    this.currentChunkNumber = 0;
    // Do not reset sessionId here, allow it to persist for potential reconnects
    
    console.log(`[${requestId}] Voice assistant stopped listening.`);
  }
  
  /**
   * Set a callback to receive audio data for visualization
   */
  setVisualizerDataCallback(callback) {
    console.log('Setting visualizer data callback.');
    this.onVisualizerDataCallback = callback;
  }
  
  /**
   * Set microphone gain (boost)
   * @param gain - Gain value (1.0 is normal, >1.0 boosts volume)
   */
  setMicrophoneGain(gain) {
    console.log(`Setting microphone gain to: ${gain}`);
    this.liveKitAudioClient.setMicrophoneGain(gain);
  }
  
  /**
   * Start updating the visualizer with real audio data
   */
  startVisualizerUpdates() {
    const requestId = this.currentRequestId || 'N/A';
    console.log(`[${requestId}] Starting visualizer updates.`);
    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
    }
    
    this.visualizerInterval = setInterval(() => {
      if (!this.onVisualizerDataCallback) return;
      
      // Get frequency data from LiveKit client
      const frequencyData = this.liveKitAudioClient.getFrequencyData();
      if (frequencyData) {
        this.onVisualizerDataCallback(frequencyData);
      }
    }, 100); // Update 10 times per second
  }
  
  /**
   * Start sending audio chunks to the server via HTTP POST
   */
  startSendingAudioChunks() {
    const requestId = this.currentRequestId;
    if (!requestId) {
        console.error("Cannot start sending audio chunks without a currentRequestId.");
        return;
    }
    console.log(`[${requestId}] Starting to send audio chunks...`);
    
    // Use a flag to control the loop instead of interval to prevent overlap on errors/slow networks
    let isSending = true;
    let audioSendTimeoutId = null;

    const sendAudioChunkLoop = async () => {
      if (!this.liveKitAudioClient.isActive() || !isSending) {
        console.log(`[${requestId}] Audio client inactive or sending stopped. Exiting send loop.`);
        return;
      }
      
      const chunkNum = (this.currentChunkNumber || 0) + 1;
      this.currentChunkNumber = chunkNum;
      const postRequestId = `post-${requestId}-chunk-${chunkNum}`;
      
      try {
        // Get audio chunk from LiveKit client (already base64 encoded)
        const audioData = await this.liveKitAudioClient.getAudioChunk(); // Assume this returns base64 string or null
        
        if (audioData && isSending) { // Check isSending again in case stopListening was called
          console.log(`[${postRequestId}] Sending audio chunk ${chunkNum}...`);
          // Send audio data through HTTP POST
          const apiEndpoint = '/apps/voice'; // Main proxy endpoint
          
          try {
            // Create a controller to allow for request abortion
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const payload = {
              audio: audioData,
              shopDomain: this.shopDomain,
              requestId: requestId,
              sessionId: this.sessionId, // Include SSE session ID if available
              chunkNumber: chunkNum
            };
            
            const headers = {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              // Add custom headers for easier server-side correlation
              'X-Request-ID': requestId,
              'X-Chunk-Number': chunkNum.toString(),
            };
            if (this.sessionId) {
              headers['X-Session-ID'] = this.sessionId;
            }
            
            console.debug(`[${postRequestId}] POST URL: ${apiEndpoint}`);
            console.debug(`[${postRequestId}] POST Headers:`, headers);
            // Avoid logging full audio payload in production
            // console.debug(`[${postRequestId}] POST Payload (excluding audio):`, { ...payload, audio: '...' });
            
            const response = await fetch(apiEndpoint, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(payload),
              credentials: 'include',
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              console.error(`[${postRequestId}] Failed to send audio chunk ${chunkNum}. Status: ${response.status} ${response.statusText}`);
              try {
                const errorBody = await response.text();
                console.error(`[${postRequestId}] Error response body:`, errorBody);
              } catch (e) {
                console.error(`[${postRequestId}] Could not read error response body.`);
              }
              
              // Dispatch specific error event if available
              // Consider parsing errorBody if it's JSON
              // if (errorData.message) { ... }
            } else {
              console.log(`[${postRequestId}] Audio chunk ${chunkNum} sent successfully. Status: ${response.status}`);
              // Optionally log response headers or body if needed for debugging
              // console.debug(`[${postRequestId}] Response headers:`, Object.fromEntries(response.headers.entries()));
            }
          } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
              console.error(`[${postRequestId}] Audio POST request for chunk ${chunkNum} timed out.`);
            } else {
              console.error(`[${postRequestId}] Error sending audio chunk ${chunkNum} via fetch:`, fetchError);
            }
            
            // Dispatch error event for UI feedback
            document.dispatchEvent(new CustomEvent('voice-assistant-error', {
              detail: {
                message: `Failed to send audio data (chunk ${chunkNum}). Please check connection.`,
                code: 'AUDIO_POST_FAILED',
                status: 500, // Indicate internal/network error
                chunk: chunkNum,
                error: fetchError.message
              }
            }));
          }
        } else if (isSending) {
          console.warn(`[${requestId}] No audio data available from LiveKit client to send for chunk ${chunkNum}.`);
        }
        
        // Schedule next chunk if still active and sending
        if (this.liveKitAudioClient.isActive() && isSending) {
          audioSendTimeoutId = setTimeout(sendAudioChunkLoop, 250); // Send approximately 4 chunks per second
        } else {
           console.log(`[${requestId}] Stopping audio chunk sending loop.`);
        }
      } catch (error) {
        console.error(`[${postRequestId}] Error in sendAudioChunkLoop:`, error);
        
        // Retry after delay if still active and sending
        if (this.liveKitAudioClient.isActive() && isSending) {
          audioSendTimeoutId = setTimeout(sendAudioChunkLoop, 1000); // Wait longer after an error
        } else {
           console.log(`[${requestId}] Stopping audio chunk sending loop after error.`);
        }
      }
    };
    
    // Add a method to stop the loop cleanly
    this.stopSendingAudioChunks = () => {
        console.log(`[${requestId}] Requesting to stop audio chunk sending loop.`);
        isSending = false;
        if (audioSendTimeoutId) {
            clearTimeout(audioSendTimeoutId);
            audioSendTimeoutId = null;
        }
    };

    // Add the stop method to the instance for external calls (e.g., in stopListening)
    this.stopSendingAudioChunks = this.stopSendingAudioChunks.bind(this);
    
    // Reset chunk counter when starting
    this.currentChunkNumber = 0;
    
    // Start the process
    sendAudioChunkLoop();
    console.log(`[${requestId}] Audio chunk sending loop (250ms interval) started.`);
  }

  // Override stopListening to also stop the audio chunk loop
  stopListening() {
    const requestId = this.currentRequestId || 'N/A';
    console.log(`[${requestId}] Stopping listening process...`);

    // Stop the audio sending loop first
    if (this.stopSendingAudioChunks) {
        this.stopSendingAudioChunks();
    }

    // Stop audio and clean up resources
    this.liveKitAudioClient.stopAudio();
    console.log(`[${requestId}] Stopped LiveKit audio client.`);
    
    // Close SSE/WebSocket connection
    if (this.wsConnection) {
      this.wsConnection.close();
      console.log(`[${requestId}] Closed SSE connection (readyState: ${this.wsConnection?.readyState})`);
      this.wsConnection = null;
    }
    
    // Clear intervals
    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
      console.log(`[${requestId}] Stopped visualizer updates.`);
      this.visualizerInterval = null;
    }
    
    // Reset request data
    this.currentRequestId = null;
    this.currentChunkNumber = 0;
    // Do not reset sessionId here, allow it to persist for potential reconnects
    
    console.log(`[${requestId}] Voice assistant stopped listening.`);
  }
}

// Expose to window for script tag loading
if (typeof window !== 'undefined') {
  window.VoiceAssistantIntegration = VoiceAssistantIntegration;
  window.LiveKitAudioClient = LiveKitAudioClient;
}

export { LiveKitAudioClient, VoiceAssistantIntegration };
