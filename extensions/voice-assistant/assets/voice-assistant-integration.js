/**
 * LiveKit Voice Assistant Integration
 * 
 * This module provides a bridge between our improved LiveKit audio implementation
 * and the existing voice assistant frontend code.
 */

// First, let's implement the LiveKitAudioClient
window.LiveKitAudioClient = class LiveKitAudioClient {
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
      const average = sum / this.volumeDataArray.length;
      
      // Normalize to 0-1 range (for volume level)
      const normalizedVolume = Math.min(average / 128, 1);
      
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
};

/**
 * Voice Assistant Integration
 * 
 * Main integration class that connects LiveKit audio to the voice assistant
 */
window.VoiceAssistantIntegration = class VoiceAssistantIntegration {
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
    this.wsConnection = null;
    this.sessionId = null;
    
    // Initialize LiveKit client with optimized audio settings
    this.liveKitClient = new window.LiveKitAudioClient(audioConfig);
    
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
      
      // Connect to SSE before starting audio
      const sseSuccess = await this.connectSSE();
      if (!sseSuccess) {
        console.error('Failed to connect to SSE stream');
        return false;
      }
      
      // Start audio capture
      const success = await this.liveKitClient.startAudio();
      if (!success) {
        return false;
      }
      
      // Start sending audio chunks to server
      this.startSendingAudioChunks();
      
      // Start feeding visualizer data
      this.startVisualizerUpdates();
      
      return true;
    } catch (error) {
      console.error('Error starting listening:', error);
      return false;
    }
  }
  
  /**
   * Connect to server via SSE (Server-Sent Events)
   * @returns {Promise<boolean>} Success status
   */
  async connectSSE() {
    return new Promise((resolve) => {
      try {
        // Close existing connection if any
        if (this.wsConnection) {
          this.wsConnection.close();
          this.wsConnection = null;
        }
        
        // Use the new stream endpoint for SSE connections
        // The URL structure should be /apps/voice?stream=true&shop=domain.com
        const sseEndpoint = '/apps/voice';
        // Add a timestamp to prevent caching issues
        const timestamp = Date.now();
        const sseUrl = `${sseEndpoint}?stream=true&shop=${encodeURIComponent(this.shopDomain)}&t=${timestamp}`;
        console.log('Connecting to SSE stream:', sseUrl);
        
        // Try using fetch first to test connection before creating EventSource
        console.log('Testing SSE endpoint connection with fetch first...');
        fetch(sseUrl, { method: 'GET', credentials: 'include' })
          .then(response => {
            console.log('SSE endpoint test response:', response.status, response.statusText);
            console.log('SSE endpoint headers:', 
              [...response.headers.entries()].map(([k, v]) => `${k}: ${v}`).join(', '));
          })
          .catch(error => {
            console.error('SSE endpoint test fetch error:', error);
          });
          
        // Create EventSource with withCredentials option to allow cookies
        const eventSource = new EventSource(sseUrl, { withCredentials: true });
        
        // Track connection state
        let isConnected = false;
        let sessionId = null;
        
        // Handle built-in open event (this fires when connection is established)
        eventSource.onopen = () => {
          console.log('SSE connection established (built-in open event)');
          
          // Mark as potentially connected with the built-in event
          // The custom 'open' event will provide the session ID
          if (!isConnected) {
            console.log('Setting connected state from built-in open event');
            isConnected = true;
            this.wsConnection = eventSource;
            
            // Resolve the promise after a short delay to allow custom events to process
            setTimeout(() => {
              if (!sessionId) {
                console.log('No session ID received yet, but connection is open');
                resolve(true);
              }
            }, 500);
          }
        };
        
        // Handle the 'open' custom event (different from the built-in open event)
        eventSource.addEventListener('open', (event) => {
          try {
            // Only try to parse if we have event data
            if (event.data) {
              const data = JSON.parse(event.data);
              console.log('SSE session established:', data);
              sessionId = data.sessionId;
              this.sessionId = sessionId;
              console.log(`Session ID: ${sessionId}`);
              
              // Mark as connected since we got the session ID
              isConnected = true;
              this.wsConnection = eventSource;
            }
          } catch (error) {
            console.error('Error parsing SSE open event:', error);
          }
        });
        
        // Handle ready event (connection fully established)
        eventSource.addEventListener('ready', (event) => {
          console.log('SSE connection ready');
          isConnected = true;
          this.wsConnection = eventSource;
          resolve(true);
        });
        
        // Handle heartbeat events
        eventSource.addEventListener('heartbeat', (event) => {
          console.log('SSE heartbeat received:', event.data);
        });
        
        // Handle standard messages
        eventSource.addEventListener('message', (event) => {
          try {
            console.log('Received SSE message event:', event.data);
            const data = JSON.parse(event.data);
            
            if (data.type === 'connected') {
              console.log('Connected to voice service');
              isConnected = true;
              this.wsConnection = eventSource;
              
              // In case we don't get a ready event
              if (!sessionId) {
                resolve(true);
              }
            }
          } catch (error) {
            console.error('Error parsing SSE message:', error);
          }
        });
        
        // Handle result events
        eventSource.addEventListener('result', (event) => {
          try {
            console.log('Received SSE result event:', event.data);
            const result = JSON.parse(event.data);
            
            // Dispatch an event that the main voice assistant can listen for
            const responseEvent = new CustomEvent('voice-assistant-response', {
              detail: result
            });
            document.dispatchEvent(responseEvent);
          } catch (error) {
            console.error('Error parsing SSE result:', error);
          }
        });
        
        // Handle error events with more detailed diagnostics
        eventSource.addEventListener('error', (event) => {
          try {
            console.error('SSE error event detected:', event);
            console.error('EventSource readyState:', eventSource.readyState);
            console.error('EventSource withCredentials:', eventSource.withCredentials);
            
            // Add more detailed error info for debugging
            const errorInfo = {
              readyState: eventSource.readyState, // 0=connecting, 1=open, 2=closed
              url: sseUrl,
              timestamp: Date.now(),
              shopDomain: this.shopDomain
            };
            console.error('Full error diagnostic info:', errorInfo);
            
            let errorMessage = 'Connection error';
            
            // Try to parse error data if available
            if (event.data) {
              try {
                const errorData = JSON.parse(event.data);
                errorMessage = errorData.message || errorMessage;
                console.error('Error data from server:', errorData);
              } catch (parseError) {
                console.error('Error data present but not valid JSON:', event.data);
              }
            }
            
            // Dispatch error event
            const errorEvent = new CustomEvent('voice-assistant-error', {
              detail: {
                message: errorMessage,
                status: 500,
                diagnostics: errorInfo
              }
            });
            document.dispatchEvent(errorEvent);
          } catch (error) {
            console.error('Error handling SSE error event:', error);
          }
        });
        
        // Handle generic error
        eventSource.onerror = (error) => {
          console.error('EventSource error:', error);
          // Attempt to log more information about the error
          console.error('EventSource readyState:', eventSource.readyState);
          console.error('EventSource URL:', sseUrl);
          
          if (this.wsConnection === eventSource) {
            this.wsConnection = null;
          }
          
          // If we haven't yet resolved the promise, do so now
          if (!isConnected) {
            eventSource.close();
            resolve(false);
          }
          
          // Dispatch error event
          const errorEvent = new CustomEvent('voice-assistant-error', {
            detail: {
              message: 'Connection to voice service lost. Please try again.',
              status: 503
            }
          });
          document.dispatchEvent(errorEvent);
        };
        
        // Handle close event
        eventSource.addEventListener('close', (event) => {
          console.log('SSE connection closed:', event?.data);
          if (this.wsConnection === eventSource) {
            this.wsConnection = null;
          }
          
          // Dispatch connection closed event
          document.dispatchEvent(new CustomEvent('voice-assistant-connection-closed'));
        });
        
        // Set a timeout in case connection takes too long
        setTimeout(() => {
          if (!isConnected) {
            console.error('SSE connection timeout');
            eventSource.close();
            resolve(false);
          }
        }, 8000);
      } catch (error) {
        console.error('Error connecting to SSE:', error);
        resolve(false);
      }
    });
  }
  
  /**
   * Stop listening
   */
  stopListening() {
    // Stop audio and clean up resources
    this.liveKitClient.stopAudio();
    
    // Close SSE/WebSocket connection
    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
    
    // Clear intervals
    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
      this.visualizerInterval = null;
    }
    
    // Reset request data
    this.currentRequestId = null;
    this.currentChunkNumber = 0;
    
    console.log('Voice assistant stopped listening');
  }
  
  /**
   * Set a callback to receive audio data for visualization
   */
  setVisualizerDataCallback(callback) {
    this.onVisualizerDataCallback = callback;
  }
  
  /**
   * Set microphone gain (boost)
   * @param gain - Gain value (1.0 is normal, >1.0 boosts volume)
   */
  setMicrophoneGain(gain) {
    this.liveKitClient.setMicrophoneGain(gain);
  }
  
  /**
   * Start updating the visualizer with real audio data
   */
  startVisualizerUpdates() {
    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
    }
    
    this.visualizerInterval = setInterval(() => {
      if (!this.onVisualizerDataCallback) return;
      
      // Get frequency data from LiveKit client
      const frequencyData = this.liveKitClient.getFrequencyData();
      if (frequencyData) {
        this.onVisualizerDataCallback(frequencyData);
      }
    }, 100); // Update 10 times per second
  }
  
  /**
   * Start sending audio chunks to the server via HTTP POST
   */
  startSendingAudioChunks() {
    // Use setTimeout for progressive audio sending
    const sendAudioChunks = async () => {
      if (!this.liveKitClient.isActive() || !this.currentRequestId) return;
      
      try {
        // Get audio chunk from LiveKit client (already base64 encoded)
        const audioData = await this.liveKitClient.getAudioChunk();
        
        if (audioData) {
          // Send audio data through HTTP POST
          const apiEndpoint = '/apps/voice'; // Main proxy endpoint
          
          try {
            // Track current chunk in sequence (incremented each time)
            this.currentChunkNumber = (this.currentChunkNumber || 0) + 1;
            
            console.log(`Sending audio chunk ${this.currentChunkNumber} for request ${this.currentRequestId}`);
            
            // Create a controller to allow for request abortion
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const response = await fetch(apiEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                audio: audioData,
                shopDomain: this.shopDomain,
                requestId: this.currentRequestId,
                sessionId: this.sessionId, // Include SSE session ID if available
                chunkNumber: this.currentChunkNumber
              }),
              credentials: 'include',
              signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
              console.error(`Error sending audio chunk: ${response.status} ${response.statusText}`);
              const errorData = await response.json().catch(() => ({}));
              console.error('Error details:', errorData);
              
              // Dispatch specific error event if available
              if (errorData.message) {
                document.dispatchEvent(new CustomEvent('voice-assistant-error', {
                  detail: {
                    message: errorData.message,
                    status: response.status
                  }
                }));
              }
            }
          } catch (fetchError) {
            if (fetchError.name === 'AbortError') {
              console.error('Audio POST request timed out');
            } else {
              console.error('Error sending audio through API endpoint:', fetchError);
            }
          }
        }
        
        // Schedule next chunk if still active
        if (this.liveKitClient.isActive()) {
          setTimeout(sendAudioChunks, 250); // Send approximately 4 chunks per second
        }
      } catch (error) {
        console.error('Error sending audio chunk:', error);
        
        // Retry after delay if still active
        if (this.liveKitClient.isActive()) {
          setTimeout(sendAudioChunks, 1000);
        }
      }
    };
    
    // Reset chunk counter when starting
    this.currentChunkNumber = 0;
    
    // Start the process
    sendAudioChunks();
  }
};