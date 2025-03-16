import {
  Room,
  LocalParticipant,
  RoomEvent,
  RemoteParticipant,
  LocalAudioTrack,
  createLocalAudioTrack,
  Track,
  ConnectionState,
} from 'livekit-client';
import { KrispNoiseFilter } from '@livekit/krisp-noise-filter';

export interface AudioConfig {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  sampleRate?: number;
  channelCount?: number;
}

const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  sampleRate: 16000, // Optimal for speech recognition
  channelCount: 1,   // Mono audio for voice
};

/**
 * LiveKit Audio Client
 * 
 * Enhanced WebRTC audio streaming with proper audio processing
 * for voice recognition. Designed to work with the existing
 * visualizer code.
 */
export class LiveKitAudioClient {
  private room: Room;
  private localParticipant: LocalParticipant | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private audioConfig: AudioConfig;
  private onVolumeCallback: ((volume: number) => void) | null = null;
  private volumeAnalyser: AnalyserNode | null = null;
  private volumeDataArray: Uint8Array | null = null;
  private volumeInterval: NodeJS.Timeout | null = null;
  private noiseFilter: KrispNoiseFilter | null = null;
  private isRecording: boolean = false;
  private mediaStream: MediaStream | null = null;
  
  // For compatibility with the existing code's visualization
  private frequencyDataArray: Uint8Array | null = null;

  constructor(audioConfig: Partial<AudioConfig> = {}) {
    this.audioConfig = { ...DEFAULT_AUDIO_CONFIG, ...audioConfig };
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    // Set up event listeners
    this.setupRoomListeners();
  }

  private setupRoomListeners() {
    this.room
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log('Connection state changed:', state);
      })
      .on(RoomEvent.Disconnected, () => {
        console.log('Disconnected from room');
        this.cleanupAudioResources();
      })
      .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio && participant instanceof RemoteParticipant) {
          console.log('Subscribed to audio track from participant', participant.identity);
        }
      });
  }

  /**
   * Connect to a LiveKit room
   */
  async connect(url: string, token: string): Promise<Room> {
    try {
      await this.room.connect(url, token);
      this.localParticipant = this.room.localParticipant;
      console.log('Connected to room:', this.room.name);
      return this.room;
    } catch (error) {
      console.error('Failed to connect to room:', error);
      throw error;
    }
  }

  /**
   * Disconnect from the current room
   */
  disconnect() {
    this.stopAudio();
    this.room.disconnect();
    this.cleanupAudioResources();
  }

  /**
   * Start audio capture with optimal settings for voice
   * Returns true if successfully started
   */
  async startAudio(): Promise<boolean> {
    if (this.isRecording && this.localAudioTrack) {
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

      // Create audio track with optimized settings
      this.localAudioTrack = await createLocalAudioTrack({
        mediaStream: this.mediaStream
      });

      // Initialize audio context and processing
      await this.setupAudioProcessing();

      // Publish track to room if connected
      if (this.localParticipant) {
        await this.localParticipant.publishTrack(this.localAudioTrack);
      }

      this.isRecording = true;
      return true;
    } catch (error) {
      console.error('Failed to create audio track:', error);
      return false;
    }
  }

  private async setupAudioProcessing() {
    if (!this.localAudioTrack || !this.mediaStream) return;

    try {
      // Initialize Web Audio API components
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.audioConfig.sampleRate || 16000, // Ensure correct sample rate
      });

      // Set up noise filtering using Krisp
      if (this.audioConfig.noiseSuppression) {
        try {
          this.noiseFilter = new KrispNoiseFilter();
          await this.localAudioTrack.setProcessor(this.noiseFilter);
          console.log('Krisp noise filter initialized');
        } catch (e) {
          console.warn('Failed to initialize Krisp noise filter:', e);
          // Continue without noise filter
        }
      }

      // Set up volume and frequency analysis
      this.setupAudioAnalysis();
    } catch (error) {
      console.error('Failed to set up audio processing:', error);
    }
  }

  private setupAudioAnalysis() {
    if (!this.localAudioTrack || !this.audioContext || !this.mediaStream) return;

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

  private startAudioMonitoring() {
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
      
      // Call volume callback if registered
      if (this.onVolumeCallback) {
        this.onVolumeCallback(normalizedVolume);
      }
    }, 100); // Update every 100ms
  }

  /**
   * Get frequency data array for visualization
   * Compatible with the existing visualizer
   */
  getFrequencyData(): Uint8Array | null {
    return this.frequencyDataArray;
  }

  /**
   * Stop the audio capture
   */
  stopAudio() {
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }
    
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
  setMicrophoneGain(gain: number) {
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(gain, this.audioContext.currentTime);
    }
  }

  /**
   * Set muted state for the audio track
   */
  setMuted(muted: boolean) {
    if (this.localAudioTrack) {
      this.localAudioTrack.muted = muted;
    }
  }

  /**
   * Get the muted state of the audio track
   */
  isMuted(): boolean {
    return this.localAudioTrack?.muted || false;
  }

  /**
   * Set a callback to monitor volume levels
   */
  onVolume(callback: (volume: number) => void) {
    this.onVolumeCallback = callback;
  }
  
  /**
   * Get raw audio data for sending to server
   * Returns base64 encoded audio data
   */
  async getAudioChunk(): Promise<string | null> {
    if (!this.localAudioTrack || !this.mediaStream) return null;
    
    try {
      return new Promise((resolve, reject) => {
        const chunks: Blob[] = [];
        
        // Use the preferred mime type
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
          
        const recorder = new MediaRecorder(this.mediaStream!, { mimeType });
        
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
  private cleanupAudioResources() {
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
    
    // Clean up noise filter
    if (this.noiseFilter) {
      this.noiseFilter = null;
    }
  }
  
  /**
   * Check if audio is currently recording
   */
  isActive(): boolean {
    return this.isRecording;
  }
}