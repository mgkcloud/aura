import { LiveKitAudioClient, AudioConfig } from './livekit-audio';

/**
 * LiveKit Voice Assistant Integration
 * 
 * This module provides a bridge between our improved LiveKit audio implementation
 * and the existing voice assistant frontend code.
 */
export class VoiceAssistantIntegration {
  private liveKitClient: LiveKitAudioClient;
  private shopDomain: string;
  private apiEndpoint: string;
  private currentRequestId: string | null = null;
  private onVisualizerDataCallback: ((data: Uint8Array) => void) | null = null;
  private visualizerInterval: NodeJS.Timeout | null = null;
  
  constructor(shopDomain: string, audioConfig?: Partial<AudioConfig>) {
    this.shopDomain = shopDomain;
    // Set the API endpoint to the correct app proxy path
    this.apiEndpoint = '/apps/voice/audio';
    
    console.log('VoiceAssistantIntegration initialized with shop:', shopDomain);
    console.log('Using API endpoint:', this.apiEndpoint);
    
    // Initialize LiveKit client with optimized audio settings
    this.liveKitClient = new LiveKitAudioClient(audioConfig);
  }
  
  /**
   * Start listening with improved audio processing
   * Returns true if successfully started
   */
  async startListening(): Promise<boolean> {
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
  setVisualizerDataCallback(callback: (data: Uint8Array) => void) {
    this.onVisualizerDataCallback = callback;
  }
  
  /**
   * Set microphone gain (boost)
   * @param gain - Gain value (1.0 is normal, >1.0 boosts volume)
   */
  setMicrophoneGain(gain: number) {
    this.liveKitClient.setMicrophoneGain(gain);
  }
  
  /**
   * Start updating the visualizer with real audio data
   */
  private startVisualizerUpdates() {
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
  private startSendingAudioChunks() {
    // Use setTimeout for progressive audio sending
    const sendAudioChunks = async () => {
      if (!this.liveKitClient.isActive() || !this.currentRequestId) return;
      
      try {
        // Get audio chunk from LiveKit client (already base64 encoded)
        const audioData = await this.liveKitClient.getAudioChunk();
        
        if (audioData) {
          // Send to server
          await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              audio: audioData,
              shopDomain: this.shopDomain,
              requestId: this.currentRequestId
            }),
          });
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
}

/**
 * Example usage in the existing voice-assistant.js:
 * 
 * // Initialize the voice assistant integration
 * const voiceIntegration = new VoiceAssistantIntegration(shopDomain);
 * 
 * // Start listening (in startListening method)
 * await voiceIntegration.startListening();
 * 
 * // Hook up to existing visualizer
 * voiceIntegration.setVisualizerDataCallback((data) => {
 *   // Use this data with existing visualization code
 *   const processedData = processFrequencyData(data);
 *   // Then draw the visualization...
 * });
 * 
 * // Stop listening (in stopListening method)
 * voiceIntegration.stopListening();
 * 
 * // Boost microphone if needed
 * voiceIntegration.setMicrophoneGain(1.5); // 50% boost
 */