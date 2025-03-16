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
    
    // Use the full Shopify App Proxy path with the store's domain
    // This ensures requests are routed through Shopify's App Proxy system
    this.apiEndpoint = '/apps/voice/audio';
    
    this.currentRequestId = null;
    this.onVisualizerDataCallback = null;
    this.visualizerInterval = null;
    
    // Initialize LiveKit client with optimized audio settings
    this.liveKitClient = new window.LiveKitAudioClient(audioConfig);
    
    // Ensure the shopDomain includes https://
    if (this.shopDomain && !this.shopDomain.startsWith('http')) {
      this.shopDomain = `https://${this.shopDomain}`;
    }
    
    console.log('VoiceAssistantIntegration initialized with shop:', shopDomain);
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
   * Stop listening
   */
  stopListening() {
    // Stop audio and clean up resources
    this.liveKitClient.stopAudio();
    
    // Clear intervals
    if (this.visualizerInterval) {
      clearInterval(this.visualizerInterval);
      this.visualizerInterval = null;
    }
    
    this.currentRequestId = null;
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
   * Start sending audio chunks to the server
   */
  startSendingAudioChunks() {
    // Use setTimeout for progressive audio sending
    const sendAudioChunks = async () => {
      if (!this.liveKitClient.isActive() || !this.currentRequestId) return;
      
      try {
        // Get audio chunk from LiveKit client (already base64 encoded)
        const audioData = await this.liveKitClient.getAudioChunk();
        
        if (audioData) {
          console.log('Sending audio chunk to:', this.apiEndpoint);
          
          try {
            // Send to server - important to use the Shopify App Proxy path
            console.log(`Sending audio to endpoint: ${this.apiEndpoint}`);
            const response = await fetch(this.apiEndpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                audio: audioData,
                shopDomain: this.shopDomain,
                requestId: this.currentRequestId
              }),
              // Ensure CORS credentials are included
              credentials: 'include'
            });
            
            console.log('Audio request status:', response.status);
            
            if (!response.ok) {
              console.error('Audio request failed:', response.status, response.statusText);
              const errorText = await response.text();
              console.error('Error details:', errorText);
            }
          } catch (fetchError) {
            console.error('Fetch error:', fetchError);
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
    
    // Start the process
    sendAudioChunks();
  }
};