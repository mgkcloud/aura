/**
 * Audio Processor Service
 * 
 * Handles buffering of incoming audio streams from participants
 * and emits events when a complete audio segment is ready for NLU processing.
 */
import { AudioFrame, AudioStream, RemoteParticipant, RemoteTrack, RemoteTrackPublication, TrackKind } from '@livekit/rtc-node';
import { EventEmitter } from 'events'; // Use Node's EventEmitter
import { Buffer } from 'buffer';
import { getLiveKitBotServiceInstance, LiveKitBotService } from './livekit.service'; // Import the LiveKit service

// Interface for audio buffer entry
interface AudioBufferEntry {
    buffer: Buffer[];
    sampleRate: number;
    channels: number;
    // Add timestamp or other metadata if needed for VAD later
}

// Define events emitted by this service (for documentation)
// audioSegmentReady: (audioBuffer: Buffer, participantIdentity: string, roomName: string, sampleRate: number, channels: number) => void;

// Extend standard EventEmitter without strict typing for now
export class AudioProcessorService extends EventEmitter {
    private livekitService: LiveKitBotService;
    private audioBuffers: Map<string, AudioBufferEntry>; // Map participantIdentity -> audio buffer info
    private activeStreams: Map<string, AudioStream>; // Map trackSid -> AudioStream to manage active processing

    constructor() {
        super();
        this.audioBuffers = new Map();
        this.activeStreams = new Map();
        this.livekitService = getLiveKitBotServiceInstance(); // Get singleton instance

        this.subscribeToLiveKitEvents();
        console.log("[AudioProcessorService] Initialized and subscribed to LiveKit events.");
    }

    private subscribeToLiveKitEvents() {
        this.livekitService.on('trackSubscribed', this.handleTrackSubscribed.bind(this));
        this.livekitService.on('trackUnsubscribed', this.handleTrackUnsubscribed.bind(this));
        this.livekitService.on('participantDisconnected', this.handleParticipantDisconnected.bind(this));
    }

    private handleTrackSubscribed(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant, roomName: string) {
        // Use TrackKind enum correctly
        if (track.kind === TrackKind.KIND_AUDIO && !this.activeStreams.has(track.sid!)) {
            console.log(`[AudioProcessorService/${roomName}] Starting audio processing for track ${track.sid} from ${participant.identity}`);
            this.startProcessingAudioStream(track, participant, roomName);
        }
    }

    private handleTrackUnsubscribed(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant, roomName: string) {
        // Use TrackKind enum correctly
        if (track.kind === TrackKind.KIND_AUDIO && this.activeStreams.has(track.sid!)) {
            console.log(`[AudioProcessorService/${roomName}] Stopping audio processing for unsubscribed track ${track.sid} from ${participant.identity}`);
            const stream = this.activeStreams.get(track.sid!);
            // Closing the stream might happen automatically, but ensure cleanup
            this.activeStreams.delete(track.sid!);
            // Optionally process any remaining buffer data here before clearing
            this.clearParticipantBuffer(participant.identity, roomName); 
        }
    }
        
    private handleParticipantDisconnected(participant: RemoteParticipant, roomName: string) {
        console.log(`[AudioProcessorService/${roomName}] Participant ${participant.identity} disconnected. Cleaning up associated audio buffer.`);
        this.clearParticipantBuffer(participant.identity, roomName);
        // Also ensure any active streams for this participant are stopped (though TrackUnsubscribed should handle this)
        participant.trackPublications.forEach(pub => {
            // Use pub.sid instead of pub.trackSid
            if (pub.sid && this.activeStreams.has(pub.sid)) { 
                 console.warn(`[AudioProcessorService/${roomName}] Cleaning up potentially orphaned stream for track ${pub.sid}`);
                 this.activeStreams.delete(pub.sid);
            }
        });
    }

    private async startProcessingAudioStream(track: RemoteTrack, participant: RemoteParticipant, roomName: string) {
        const audioStream = new AudioStream(track);
        this.activeStreams.set(track.sid!, audioStream);

        try {
            for await (const audioFrame of audioStream) {
                // Check if we should still be processing this stream
                if (!this.activeStreams.has(track.sid!)) {
                    console.log(`[AudioProcessorService/${roomName}] Stream processing stopped externally for track ${track.sid}.`);
                    break; 
                }
                this.processAudioFrame(audioFrame, participant.identity, roomName);
            }
            console.log(`[AudioProcessorService/${roomName}] Audio stream naturally finished for track ${track.sid} from ${participant.identity}`);
        } catch (error) {
            console.error(`[AudioProcessorService/${roomName}] Error processing audio stream for ${participant.identity}:`, error);
        } finally {
            // Ensure cleanup happens when the stream ends or errors
            console.log(`[AudioProcessorService/${roomName}] Cleaning up after audio stream ended/failed for ${participant.identity}.`);
            this.activeStreams.delete(track.sid!);
            // Optionally process any remaining buffer data here before clearing
            this.clearParticipantBuffer(participant.identity, roomName); 
        }
    }

    /**
     * Processes a received audio frame, adding it to a buffer.
     * When enough data is buffered or silence is detected (TODO), triggers NLU processing.
     */
    private processAudioFrame(audioFrame: AudioFrame, participantIdentity: string, roomName: string) {
        let participantBuffer = this.audioBuffers.get(participantIdentity);
        if (!participantBuffer) {
            participantBuffer = { buffer: [], sampleRate: audioFrame.sampleRate, channels: audioFrame.channels };
            this.audioBuffers.set(participantIdentity, participantBuffer);
            console.log(`[AudioProcessorService/${roomName}] Created audio buffer for ${participantIdentity}`);
        }

        // Append new data (convert Int16Array to Buffer)
        const newData = Buffer.from(audioFrame.data.buffer, audioFrame.data.byteOffset, audioFrame.data.byteLength);
        participantBuffer.buffer.push(newData);

        // --- Trigger Segment Ready (Simplified Example: Trigger after N frames) ---
        // TODO: Implement proper VAD (Voice Activity Detection) or buffer length check.
        const MAX_BUFFER_FRAMES = 50; // Example: process after ~5 seconds 
        if (participantBuffer.buffer.length >= MAX_BUFFER_FRAMES) {
            console.log(`[AudioProcessorService/${roomName}] Buffer for ${participantIdentity} reached ${MAX_BUFFER_FRAMES} frames. Emitting segment.`);
            const completeBuffer = Buffer.concat(participantBuffer.buffer);
            // Clear buffer after processing
            participantBuffer.buffer = []; 
            
            // Emit event with the complete audio segment
            this.emit('audioSegmentReady', 
                completeBuffer, 
                participantIdentity, 
                roomName, 
                participantBuffer.sampleRate, 
                participantBuffer.channels
            );
        }
    }

    private clearParticipantBuffer(participantIdentity: string, roomName: string) {
        if (this.audioBuffers.has(participantIdentity)) {
            // TODO: Potentially process any remaining data before clearing?
            this.audioBuffers.delete(participantIdentity);
            console.log(`[AudioProcessorService/${roomName}] Cleared audio buffer for ${participantIdentity}.`);
        }
    }
}

// --- Service Instantiation --- (Singleton pattern)
let audioProcessorServiceInstance: AudioProcessorService | null = null;

export function getAudioProcessorServiceInstance(): AudioProcessorService {
  if (!audioProcessorServiceInstance) {
    try {
      // Ensure LiveKit service is initialized first if it's a dependency
      getLiveKitBotServiceInstance(); 
      audioProcessorServiceInstance = new AudioProcessorService();
    } catch (error) {
      console.error("Failed to initialize AudioProcessorService:", error);
      throw error; 
    }
  }
  return audioProcessorServiceInstance;
}