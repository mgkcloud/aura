/**
 * LiveKit Bot Service
 * 
 * Manages the bot's connection to LiveKit rooms as a participant.
 * Handles connection logic, participant events, and track subscriptions.
 * Emits events for other services to consume (e.g., audio track subscribed).
 */
import {
  Room,
  RoomEvent, 
  RemoteParticipant,
  Track, 
  TrackPublication,
  ConnectionState, 
  DisconnectReason,
  RoomOptions, 
  RemoteTrackPublication, 
  RemoteTrack, 
  TrackKind,
  AudioFrame, 
  AudioSource, 
  LocalAudioTrack, 
  LocalTrackPublication, 
  TrackPublishOptions, 
  TrackSource,
  DataPacketKind // Added back for potential future use
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { Mutex } from 'async-mutex';
import { EventEmitter } from 'events'; // Use Node's EventEmitter
import { Buffer } from 'buffer';

// Define the base event map interface needed for typed EventEmitter
interface EventMap {
  [key: string]: any[];
}

// Define configuration interface specific to this service
interface LiveKitBotConfig {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
}

// Interface to store room object
interface RoomEntry {
    room: Room;
}

// Define events emitted by this service using EventMap structure
export interface LiveKitBotServiceEvents extends EventMap {
  connectionStateChanged: [roomName: string, state: ConnectionState];
  trackSubscribed: [track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant, roomName: string];
  trackUnsubscribed: [track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant, roomName: string];
  participantDisconnected: [participant: RemoteParticipant, roomName: string];
  // Add more events as needed
}

// Explicitly type the EventEmitter with the event map
export class LiveKitBotService extends (EventEmitter as new () => EventEmitter<LiveKitBotServiceEvents>) {
  private config: LiveKitBotConfig;
  private connectedRooms: Map<string, RoomEntry>; // Map roomName -> RoomEntry
  private currentRoomStates: Map<string, ConnectionState>; // Track state internally
  private roomMutex: Mutex; 

  constructor() {
    super(); // Call EventEmitter constructor

    const livekitUrl = process.env.LIVEKIT_URL;
    const livekitApiKey = process.env.LIVEKIT_KEY;
    const livekitApiSecret = process.env.LIVEKIT_SECRET;

    if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
      console.error("[LiveKitBotService] Missing required LiveKit environment variables (LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET)");
      throw new Error("LiveKit configuration missing for LiveKitBotService");
    }

    let wsUrl = livekitUrl;
    if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        wsUrl = livekitUrl.startsWith('localhost') || livekitUrl.startsWith('127.0.0.1') 
            ? `ws://${livekitUrl}` 
            : `wss://${livekitUrl}`;
        console.warn(`[LiveKitBotService] LIVEKIT_URL did not start with ws:// or wss://. Using inferred URL: ${wsUrl}`);
    }

    this.config = {
      livekitUrl: wsUrl, 
      livekitApiKey,
      livekitApiSecret,
    };

    console.log("[LiveKitBotService] Logging level configured via environment (e.g., LIVEKIT_LOG)"); 

    this.connectedRooms = new Map();
    this.currentRoomStates = new Map(); 
    this.roomMutex = new Mutex();

    console.log("[LiveKitBotService] Initialized.");
  }

  private async createBotToken(roomName: string, botIdentity: string): Promise<string> {
      const at = new AccessToken(this.config.livekitApiKey, this.config.livekitApiSecret, {
          identity: botIdentity,
      });
      at.addGrant({ 
          room: roomName,
          roomJoin: true,
          canPublish: true, 
          canSubscribe: true, 
          canPublishData: true, 
          hidden: true, 
          recorder: false, 
      });
      at.ttl = '1h'; 
      return await at.toJwt();
  }

  async joinRoom(roomName: string, botIdentity: string = 'voice-assistant-bot'): Promise<Room | null> {
    const release = await this.roomMutex.acquire(); 
    try {
      const existingRoomEntry = this.connectedRooms.get(roomName);
      const currentState = this.currentRoomStates.get(roomName);

      // Check connection state using the tracked state and correct enum values
      if (existingRoomEntry && currentState && (currentState === ConnectionState.CONN_CONNECTED || currentState === ConnectionState.CONN_RECONNECTING)) {
          console.log(`[LiveKitBotService] Already connected or connecting/reconnecting to room: ${roomName}`);
          return existingRoomEntry.room;
      } else if (existingRoomEntry) {
          console.warn(`[LiveKitBotService] Found stale room entry for ${roomName} in state ${currentState}. Cleaning up before rejoining.`);
          await existingRoomEntry.room.disconnect(); 
          this.connectedRooms.delete(roomName); 
          this.currentRoomStates.delete(roomName);
      }

      console.log(`[LiveKitBotService] Attempting to join room: ${roomName} as ${botIdentity}`);
      
      const botRoom = new Room(); 
      
      this.connectedRooms.set(roomName, { room: botRoom }); 
      this.currentRoomStates.set(roomName, ConnectionState.CONN_RECONNECTING); // Set initial state

      try {
        const token = await this.createBotToken(roomName, botIdentity);
        this.setupRoomListeners(botRoom, roomName, botIdentity);

        const connectionOptions = {
            autoSubscribe: true, 
            dynacast: true, 
        };

        await botRoom.connect(this.config.livekitUrl, token, connectionOptions);

        console.log(`[LiveKitBotService] Successfully initiated connection to room: ${roomName}.`);
        
        // Handle existing participants - emit events for subscribed tracks
        botRoom.remoteParticipants.forEach((participant: RemoteParticipant) => {
            participant.trackPublications.forEach((pub: RemoteTrackPublication) => { 
                if (pub.kind === TrackKind.KIND_AUDIO && pub.track) { 
                     console.log(`[LiveKitBotService/${roomName}] Found existing subscribed audio track ${pub.sid} from ${participant.identity}`); 
                     this.emit('trackSubscribed', pub.track as RemoteTrack, pub, participant, roomName);
                }
            });
        });

        return botRoom;

      } catch (error) {
        console.error(`[LiveKitBotService] Error joining room ${roomName}:`, error);
        const roomEntry = this.connectedRooms.get(roomName);
        if (roomEntry && roomEntry.room === botRoom) { 
             botRoom.removeAllListeners(); 
             this.connectedRooms.delete(roomName); 
             this.currentRoomStates.delete(roomName);
        }
        return null;
      }
    } finally {
      release(); 
    }
  }

  private setupRoomListeners(room: Room, roomName: string, botIdentity: string) {
    console.log(`[LiveKitBotService/${roomName}] Setting up listeners for bot ${botIdentity}`);
    
    room
      .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        console.log(`[LiveKitBotService/${roomName}] Connection State Changed: ${state}`);
        this.currentRoomStates.set(roomName, state); 
        this.emit('connectionStateChanged', roomName, state); 

        if (state === ConnectionState.CONN_DISCONNECTED) { 
          console.log(`[LiveKitBotService/${roomName}] Disconnected. Cleaning up room reference.`);
          this.handleRoomDisconnection(roomName); 
        }
      })
      .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant, reason?: DisconnectReason) => {
        console.log(`[LiveKitBotService/${roomName}] Participant Disconnected: ${participant.identity}. Reason: ${reason}`);
        this.emit('participantDisconnected', participant, roomName); 
      })
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => { 
        console.log(`[LiveKitBotService/${roomName}] Track Subscribed: ${track.kind} (${track.sid}) from ${participant.identity}`);
        this.emit('trackSubscribed', track, publication, participant, roomName); 
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
        console.log(`[LiveKitBotService/${roomName}] Track Unsubscribed: ${track.kind} (${track.sid}) from ${participant.identity}`);
        this.emit('trackUnsubscribed', track, publication, participant, roomName); 
      })
      .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
         console.warn(`[LiveKitBotService/${roomName}] Disconnected event received. Reason: ${reason}`);
         // ConnectionStateChanged listener handles cleanup
      });
  }

  // Method to get the actual Room object if needed by orchestrator
  getRoom(roomName: string): Room | undefined {
      return this.connectedRooms.get(roomName)?.room;
  }

  /**
   * Publishes the synthesized TTS audio back to the room.
   * @param roomName The room to publish to.
   * @param ttsAudioData The raw PCM audio data (Buffer) from TTS.
   * @param sampleRate Sample rate of the TTS audio.
   * @param numChannels Number of channels of the TTS audio (default 1).
   */
  async publishTTSTrack(roomName: string, ttsAudioData: Buffer, sampleRate: number, numChannels: number = 1) {
      const roomEntry = this.connectedRooms.get(roomName);
      const currentState = this.currentRoomStates.get(roomName);
      
      if (!roomEntry || currentState !== ConnectionState.CONN_CONNECTED) { 
          console.error(`[LiveKitBotService/${roomName}] Cannot publish TTS, room not connected.`);
          return;
      }
      const room = roomEntry.room;
      const localParticipant = room.localParticipant; 
      if (!localParticipant) {
          console.error(`[LiveKitBotService/${roomName}] Cannot publish TTS, localParticipant is undefined.`);
          return;
      }
      
      console.log(`[LiveKitBotService/${roomName}] Publishing TTS audio track... Sample Rate: ${sampleRate}, Channels: ${numChannels}, Data size: ${ttsAudioData.length} bytes`);
      
      let ttsTrack: LocalAudioTrack | null = null;
      let audioSource: AudioSource | null = null; 
      try {
          // Convert Buffer to Int16Array for AudioSource
          const int16Data = new Int16Array(ttsAudioData.buffer, ttsAudioData.byteOffset, ttsAudioData.byteLength / 2);
          
          audioSource = new AudioSource(sampleRate, numChannels);
          ttsTrack = LocalAudioTrack.createAudioTrack('bot-tts-source', audioSource); 

          // Instantiate TrackPublishOptions correctly using TrackSource enum member
          const publishOptions = new TrackPublishOptions({
              source: TrackSource.SOURCE_MICROPHONE, // Use correct enum member
          });

          const publication: LocalTrackPublication = await localParticipant.publishTrack(ttsTrack, publishOptions);
          console.log(`[LiveKitBotService/${roomName}] Published TTS track: ${publication.sid}`); // Use publication.sid

          // Push the TTS audio data into the source in chunks
          const chunkSize = sampleRate * 0.1 * numChannels; // 100ms chunks
          console.log(`[LiveKitBotService/${roomName}] Sending TTS audio in chunks of ${chunkSize} samples`);
          
          for (let i = 0; i < int16Data.length; i += chunkSize) {
              const chunk = int16Data.slice(i, i + chunkSize);
              const frame = new AudioFrame(chunk, sampleRate, numChannels, chunk.length / numChannels);
              await audioSource.captureFrame(frame); 
          }

          console.log(`[LiveKitBotService/${roomName}] Finished pushing TTS audio data.`);
          
          // Keep the track published for a short time to ensure all audio is delivered
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Automatically unpublish after sending all data
          console.log(`[LiveKitBotService/${roomName}] Unpublishing TTS track ${publication.sid}...`);
          // Use track's SID for unpublishing
          await localParticipant.unpublishTrack(ttsTrack.sid!); 
          console.log(`[LiveKitBotService/${roomName}] TTS track ${publication.sid} unpublished.`);

      } catch (error) {
          console.error(`[LiveKitBotService/${roomName}] Error publishing TTS track:`, error);
          // Clean up track if publication failed mid-way
          // Check using the trackPublications map on the local participant
          if (ttsTrack && localParticipant.trackPublications.get(ttsTrack.sid!)) {
              await localParticipant.unpublishTrack(ttsTrack.sid!); 
          }
      } finally {
          // Ensure the audio source is closed after publishing is complete or on error
          if (audioSource) {
              audioSource.close();
          }
      }
  }


  private handleRoomDisconnection(roomName: string) {
    this.roomMutex.runExclusive(async () => {
      const roomEntry = this.connectedRooms.get(roomName);
      if (roomEntry) {
        console.log(`[LiveKitBotService] Cleaning up resources for disconnected room: ${roomName}`);
        roomEntry.room.removeAllListeners(); 
        this.connectedRooms.delete(roomName);
        this.currentRoomStates.delete(roomName); 
        console.log(`[LiveKitBotService] Room ${roomName} removed from connected map.`);
      } else {
         console.log(`[LiveKitBotService] handleRoomDisconnection called for ${roomName}, but room not found in map.`);
      }
    });
  }

  async leaveRoom(roomName: string) {
    const release = await this.roomMutex.acquire();
    try {
      const roomEntry = this.connectedRooms.get(roomName);
      if (roomEntry) {
        console.log(`[LiveKitBotService] Leaving room: ${roomName}`);
        roomEntry.room.removeAllListeners(); 
        await roomEntry.room.disconnect(); 
        this.handleRoomDisconnection(roomName); // Manual call after removing listeners
      } else {
        console.log(`[LiveKitBotService] Bot is not in room: ${roomName}, cannot leave.`);
      }
    } finally {
      release();
    }
  }

  async disconnectAll() {
    console.log("[LiveKitBotService] Disconnecting from all rooms...");
    const release = await this.roomMutex.acquire();
    try {
      const promises: Promise<void>[] = []; // Explicitly type promises array
      const roomNames = Array.from(this.connectedRooms.keys()); 
      for (const roomName of roomNames) {
        const roomEntry = this.connectedRooms.get(roomName);
        if (roomEntry) {
          console.log(`[LiveKitBotService] Disconnecting from room: ${roomName}`);
          roomEntry.room.removeAllListeners(); 
          promises.push(roomEntry.room.disconnect());
        }
      }
      await Promise.allSettled(promises);
      this.connectedRooms.clear(); 
      this.currentRoomStates.clear(); 
      console.log("[LiveKitBotService] Disconnected from all rooms.");
    } finally {
      release();
    }
  }
}

// --- Service Instantiation --- (Singleton pattern)
let liveKitBotServiceInstance: LiveKitBotService | null = null;

export function getLiveKitBotServiceInstance(): LiveKitBotService {
  if (!liveKitBotServiceInstance) {
    try {
      liveKitBotServiceInstance = new LiveKitBotService();
    } catch (error) {
      console.error("Failed to initialize LiveKitBotService:", error);
      throw error; 
    }
  }
  return liveKitBotServiceInstance;
}