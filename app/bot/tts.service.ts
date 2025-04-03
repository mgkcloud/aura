/**
 * TTS Service
 * 
 * Handles interaction with the Text-to-Speech API (Play.ht).
 */
import { Buffer } from 'buffer';
import fetch from 'node-fetch'; // Assuming node-fetch is installed
import { EventEmitter } from 'events';
import { Lame } from 'node-lame';
import { Readable } from 'stream';

// Define configuration interface specific to this service
interface TtsConfig {
  playhtUserId?: string;      
  playhtSecretKey?: string;   
  playhtApiUrl: string;
  voiceId: string; // Default or configured voice ID
}

// Define the structure for TTS results
export interface TtsResult {
    audioBuffer?: Buffer; // Buffer containing raw audio data (e.g., PCM)
    sampleRate?: number;
    error?: string; // Optional error message
    // Add stream reference if using streaming API later
}

export class TtsService extends EventEmitter {
  private config: TtsConfig;

  constructor() {
    super();
    const userId = process.env.PLAYHT_USER_ID;
    const secretKey = process.env.PLAYHT_SECRET_KEY;

    if (!userId || !secretKey) {
      console.warn("[TtsService] PLAYHT_USER_ID or PLAYHT_SECRET_KEY not found. TTS processing will be disabled.");
    }
    
    this.config = {
        playhtUserId: userId,
        playhtSecretKey: secretKey,
        playhtApiUrl: "https://api.play.ht/api/v2/tts", // Standard API v2 endpoint
        voiceId: process.env.PLAYHT_VOICE_ID || "s3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json" // Example default voice
    };

    console.log("[TtsService] Initialized.");
  }

  /**
   * Synthesizes text into speech using the Play.ht API.
   * Currently fetches the entire audio file (non-streaming).
   * @param text The text to synthesize.
   * @param roomName For logging purposes.
   * @returns {Promise<TtsResult>} Object containing audio buffer and sample rate, or an error.
   */
  async synthesizeSpeech(text: string, roomName: string): Promise<TtsResult> {
    if (!this.config.playhtUserId || !this.config.playhtSecretKey) {
        const errorMsg = "Play.ht credentials not configured. Skipping TTS.";
        console.warn(`[TtsService/${roomName}] ${errorMsg}`);
        return { error: errorMsg };
    }
    if (!text) {
        return { error: "No text provided for TTS synthesis." };
    }

    console.log(`[TtsService/${roomName}] Synthesizing text: "${text.substring(0, 50)}..."`);

    try {
        const response = await fetch(this.config.playhtApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.playhtSecretKey}`,
                'X-User-ID': this.config.playhtUserId,
                'Accept': 'audio/mpeg', // Request MP3 first for simplicity, could change to PCM/wav later
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                voice: this.config.voiceId,
                output_format: 'mp3', // Request MP3 initially
                quality: 'medium', // Optional: low, medium, high, premium
                sample_rate: 16000, // Request 16kHz to match input/WebRTC standard
                speed: 1.0, // Normal playback speed
            }),
        });

        if (!response.ok) {
            let errorDetails = `Status: ${response.status}`;
            try {
                const errorBody = await response.json();
                console.error(`[TtsService/${roomName}] Play.ht API Error Body:`, errorBody);
                // Use type assertion to access potential properties
                errorDetails = (errorBody as any)?.error_message || JSON.stringify(errorBody) || errorDetails;
            } catch (e) {
                 errorDetails = `${errorDetails} - ${await response.text()}`;
            }
            throw new Error(`Play.ht API request failed: ${errorDetails}`);
        }

        // Get the audio data as a Buffer
        const audioData = await response.arrayBuffer();
        const mp3Buffer = Buffer.from(audioData);
        
        console.log(`[TtsService/${roomName}] Received MP3 audio buffer (size: ${mp3Buffer.length}). Decoding to PCM...`);

        // Decode MP3 to raw PCM using node-lame
        const pcmBuffer = await this.decodeMp3ToPcm(mp3Buffer);
        console.log(`[TtsService/${roomName}] Decoded PCM buffer size: ${pcmBuffer.length}`);
        
        // Emit event for potential listeners
        this.emit('ttsComplete', roomName, pcmBuffer.length);
        
        return { 
            audioBuffer: pcmBuffer,
            sampleRate: 16000 // Assuming 16kHz output from decoder
        }; 

    } catch (error: any) {
        const errorMsg = `Error synthesizing speech: ${error.message || error}`;
        console.error(`[TtsService/${roomName}] ${errorMsg}`, error);
        return { error: errorMsg };
    }
  }

  /**
   * Decode MP3 buffer to raw PCM audio using node-lame.
   * @param mp3Buffer The MP3 audio buffer to decode.
   * @returns Promise<Buffer> The decoded PCM audio buffer.
   */
  private async decodeMp3ToPcm(mp3Buffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        // Create a readable stream from the MP3 buffer
        const mp3Stream = new Readable();
        mp3Stream.push(mp3Buffer);
        mp3Stream.push(null); // Mark the end of the stream
        
        // Set up the decoder
        const decoder = new Lame({
          output: 'buffer', // Output as buffer
          bitrate: 128,     // Adjust if needed
          raw: true,        // Output raw PCM
          'little-endian': true, // Use little endian format for PCM
          sfreq: 16,        // 16kHz sample rate
        }).setFile('-');    // Read from stdin (stream)
        
        // Pipe the MP3 stream to the decoder
        mp3Stream.pipe(decoder);
        
        // Collect chunks of decoded PCM data
        const pcmChunks: Buffer[] = [];
        decoder.on('data', (chunk: Buffer) => {
          pcmChunks.push(chunk);
        });
        
        // Handle completion
        decoder.on('end', () => {
          const pcmBuffer = Buffer.concat(pcmChunks);
          resolve(pcmBuffer);
        });
        
        // Handle errors
        decoder.on('error', (err: Error) => {
          reject(new Error(`MP3 decoding failed: ${err.message}`));
        });
        
        // Start decoding
        decoder.decode();
        
      } catch (error) {
        reject(new Error(`Failed to set up MP3 decoding: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }
}

// --- Service Instantiation --- (Singleton pattern)
let ttsServiceInstance: TtsService | null = null;

export function getTtsServiceInstance(): TtsService {
  if (!ttsServiceInstance) {
    try {
      ttsServiceInstance = new TtsService();
    } catch (error) {
      console.error("Failed to initialize TtsService:", error);
      throw error; 
    }
  }
  return ttsServiceInstance;
}