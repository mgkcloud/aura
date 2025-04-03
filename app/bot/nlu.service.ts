/**
 * NLU Service
 * 
 * Handles interaction with the Natural Language Understanding model (Ultravox via Replicate).
 */
import Replicate from 'replicate';
import { Buffer } from 'buffer';

// Define configuration interface specific to this service
interface NluConfig {
  replicateApiToken?: string; 
  ultravoxModelVersion: string;
}

// Define the expected structure for NLU results
export interface NluResult {
    text: string;
    toolCalls: any[]; // Define a more specific type based on expected tool call structure
    error?: string; // Optional error message
}

export class NluService {
  private config: NluConfig;
  private replicateClient: Replicate | null = null;

  constructor() {
    const replicateToken = process.env.REPLICATE_API_TOKEN;
    const ultravoxModel = process.env.ULTRAVOX_MODEL_VERSION || "livekit/ultravox-v0.5"; // Default model

    if (!replicateToken) {
      console.warn("[NluService] REPLICATE_API_TOKEN not found. NLU processing will be disabled.");
    } else {
       this.replicateClient = new Replicate({ auth: replicateToken });
       console.log("[NluService] Replicate client initialized.");
    }
    
    this.config = {
        replicateApiToken: replicateToken,
        ultravoxModelVersion: ultravoxModel,
    };

    console.log("[NluService] Initialized.");
  }

  /**
   * Sends buffered audio data to Replicate (Ultravox) for NLU processing.
   * @param audioBuffer The complete audio buffer.
   * @param participantIdentity The identity of the speaker.
   * @param roomName The room name.
   * @param sampleRate The audio sample rate.
   * @param channels The number of audio channels.
   * @returns {Promise<NluResult>} The parsed NLU result or an error indication.
   */
  async processAudio(audioBuffer: Buffer, participantIdentity: string, roomName: string, sampleRate: number, channels: number): Promise<NluResult> {
    if (!this.replicateClient) {
        const errorMsg = "Replicate client not initialized. Skipping NLU.";
        console.warn(`[NluService/${roomName}] ${errorMsg}`);
        return { text: "", toolCalls: [], error: errorMsg };
    }

    console.log(`[NluService/${roomName}] Sending audio buffer (size: ${audioBuffer.length}) from ${participantIdentity} to Replicate model: ${this.config.ultravoxModelVersion}`);

    try {
        // --- Convert Buffer to suitable format for Replicate --- 
        const wavBuffer = this.encodeWav(audioBuffer, sampleRate, channels); // Use WAV encoding
        const audioDataUri = `data:audio/wav;base64,${wavBuffer.toString('base64')}`;

        // TODO: Define the correct input structure for the Ultravox model
        const input = {
            audio: audioDataUri,
            // Add other parameters if needed by the model (e.g., language, task)
        };

        // Run prediction - Cast model string to required type format
        const output = await this.replicateClient.run(
            this.config.ultravoxModelVersion as `${string}/${string}:${string}` | `${string}/${string}`, 
            { input }
        );

        console.log(`[NluService/${roomName}] Received NLU response from Replicate for ${participantIdentity}:`, output);

        // --- Parse NLU Response --- 
        // TODO: Implement robust parsing based on the actual output structure of the Ultravox model.
        const responseText = (output as any)?.transcription || ""; // Default to empty string
        const toolCalls = (output as any)?.tool_calls || []; // Default to empty array

        console.log(`[NluService/${roomName}] Parsed Text: ${responseText}`);
        console.log(`[NluService/${roomName}] Parsed Tool Calls:`, toolCalls);

        return { text: responseText, toolCalls: toolCalls };

    } catch (error: any) {
        const errorMsg = `Error calling Replicate API for ${participantIdentity}: ${error.message || error}`;
        console.error(`[NluService/${roomName}] ${errorMsg}`, error);
        return { text: "", toolCalls: [], error: errorMsg };
    }
  }

  /**
   * Placeholder function to encode raw PCM audio buffer into WAV format.
   * NOTE: This is a simplified placeholder and needs a proper implementation.
   * @param pcmData Raw PCM audio data.
   * @param sampleRate Sample rate.
   * @param channels Number of channels.
   * @returns Buffer containing WAV data.
   */
  private encodeWav(pcmData: Buffer, sampleRate: number, channels: number): Buffer {
      // console.warn("[NluService] encodeWav is a placeholder and needs proper implementation.");
      // Basic WAV header structure
      const bitsPerSample = 16; // Assuming 16-bit PCM
      const byteRate = sampleRate * channels * (bitsPerSample / 8);
      const blockAlign = channels * (bitsPerSample / 8);
      const dataSize = pcmData.length;
      const fileSize = 36 + dataSize; // 44 bytes header - 8 bytes for RIFF chunk descriptor

      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(fileSize, 4);
      header.write('WAVE', 8);
      header.write('fmt ', 12);
      header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
      header.writeUInt16LE(1, 20);  // AudioFormat (PCM = 1)
      header.writeUInt16LE(channels, 22);
      header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(byteRate, 28);
      header.writeUInt16LE(blockAlign, 32);
      header.writeUInt16LE(bitsPerSample, 34);
      header.write('data', 36);
      header.writeUInt32LE(dataSize, 40);

      return Buffer.concat([header, pcmData]);
  }
}

// --- Service Instantiation --- (Singleton pattern)
let nluServiceInstance: NluService | null = null;

export function getNluServiceInstance(): NluService {
  if (!nluServiceInstance) {
    try {
      nluServiceInstance = new NluService();
    } catch (error) {
      console.error("Failed to initialize NluService:", error);
      throw error; 
    }
  }
  return nluServiceInstance;
}