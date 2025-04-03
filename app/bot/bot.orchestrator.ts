/**
 * Bot Orchestrator Service
 * 
 * Coordinates the different bot services (LiveKit connection, audio processing, NLU, TTS).
 * Listens for events and triggers actions across services.
 */
import { getLiveKitBotServiceInstance, LiveKitBotService } from './livekit.service';
import { getAudioProcessorServiceInstance, AudioProcessorService } from './audio.processor';
import { getNluServiceInstance, NluService, NluResult } from './nlu.service';
import { getTtsServiceInstance, TtsService } from './tts.service';

// TODO: Import TTS service when created

export class BotOrchestratorService {
    private livekitService: LiveKitBotService;
    private audioProcessor: AudioProcessorService;
    private nluService: NluService;
    // private ttsService: TtsService; // TODO

    private ttsService: TtsService;

    constructor() {
        // Get instances of the dependent services (singletons)
        this.livekitService = getLiveKitBotServiceInstance();
        this.audioProcessor = getAudioProcessorServiceInstance();
        this.nluService = getNluServiceInstance();
        // this.ttsService = getTtsServiceInstance(); // TODO

        this.ttsService = getTtsServiceInstance();

        this.subscribeToServiceEvents();
        console.log("[BotOrchestratorService] Initialized and subscribed to service events.");
    }

    private subscribeToServiceEvents() {
        this.audioProcessor.on('audioSegmentReady', this.handleAudioSegment.bind(this));
        
        // TODO: Listen for NLU results to trigger TTS (Handled within handleAudioSegment for now)

        // TODO: Listen for NLU results to trigger TTS
        // this.nluService.on('nluResultReady', this.handleNluResult.bind(this)); 

        // TODO: Listen for TTS completion to potentially signal UI or next action
        // this.ttsService.on('ttsComplete', this.handleTtsComplete.bind(this));

        // Handle participant disconnection to potentially clean up state if needed
        this.livekitService.on('participantDisconnected', (participant, roomName) => {
            console.log(`[BotOrchestratorService/${roomName}] Participant ${participant.identity} disconnected.`);
            // Orchestrator might need to manage overall conversation state related to a participant
        });
    }

    /**
     * Handles a ready audio segment from the AudioProcessorService.
     * Triggers NLU processing and TTS.
     */
    private async handleAudioSegment(audioBuffer: Buffer, participantIdentity: string, roomName: string, sampleRate: number, channels: number) {
        console.log(`[BotOrchestratorService/${roomName}] Received audio segment from ${participantIdentity}. Triggering NLU.`);
        
        const nluResult: NluResult = await this.nluService.processAudio(
            audioBuffer, 
            participantIdentity, 
            roomName, 
            sampleRate, 
            channels
        );

        if (nluResult.error) {
            console.error(`[BotOrchestratorService/${roomName}] NLU processing failed for ${participantIdentity}: ${nluResult.error}`);
            // Handle NLU error - maybe send an error message back via TTS?
            // await this.ttsService.synthesizeAndPublish(roomName, "Sorry, I had trouble understanding that.");
            return;
        }
        
        // --- Process NLU Results --- 
        console.log(`[BotOrchestratorService/${roomName}] NLU result for ${participantIdentity}: Text='${nluResult.text}', Tools=${JSON.stringify(nluResult.toolCalls)}`);

        // --- Trigger TTS --- 
        if (nluResult.text) {
            console.log(`[BotOrchestratorService/${roomName}] Triggering TTS for text: "${nluResult.text.substring(0, 50)}..."`);
            
            // Synthesize speech
            const ttsResult = await this.ttsService.synthesizeSpeech(nluResult.text, roomName);

            if (ttsResult.error || !ttsResult.audioBuffer || !ttsResult.sampleRate) {
                console.error(`[BotOrchestratorService/${roomName}] TTS synthesis failed: ${ttsResult.error}`);
                // Handle TTS error - maybe send a text message back?
            } else {
                console.log(`[BotOrchestratorService/${roomName}] TTS synthesis successful. Publishing audio.`);
                
                // Publish the TTS audio to the LiveKit room
                await this.livekitService.publishTTSTrack(
                    roomName,
                    ttsResult.audioBuffer,
                    ttsResult.sampleRate, 
                    1 // Assuming mono audio
                );
                
                console.log(`[BotOrchestratorService/${roomName}] TTS audio published to room.`);
            }
        }

        // --- Process Tool Calls ---
        if (nluResult.toolCalls && nluResult.toolCalls.length > 0) {
            // TODO: Trigger Tool Execution Engine
            console.log(`[BotOrchestratorService/${roomName}] TODO: Trigger Tool Execution for calls:`, nluResult.toolCalls);
            // Example: await triggerToolExecution(roomName, participantIdentity, nluResult.toolCalls);
        }
    }

    // --- Public methods to control the bot ---

    /**
     * Instructs the bot to join a specific room.
     */
    async joinRoom(roomName: string, botIdentity?: string): Promise<void> {
        console.log(`[BotOrchestratorService] Requesting bot to join room: ${roomName}`);
        try {
            await this.livekitService.joinRoom(roomName, botIdentity);
        } catch (error) {
            console.error(`[BotOrchestratorService] Error joining room ${roomName}:`, error);
        }
    }

    /**
     * Instructs the bot to leave a specific room.
     */
    async leaveRoom(roomName: string): Promise<void> {
        console.log(`[BotOrchestratorService] Requesting bot to leave room: ${roomName}`);
        try {
            await this.livekitService.leaveRoom(roomName);
        } catch (error) {
            console.error(`[BotOrchestratorService] Error leaving room ${roomName}:`, error);
        }
    }

    /**
     * Disconnects the bot from all rooms.
     */
    async disconnectAll(): Promise<void> {
        console.log(`[BotOrchestratorService] Requesting bot to disconnect from all rooms.`);
        try {
            await this.livekitService.disconnectAll();
        } catch (error) {
            console.error(`[BotOrchestratorService] Error disconnecting all rooms:`, error);
        }
    }
}

// --- Service Instantiation --- (Singleton pattern)
let botOrchestratorInstance: BotOrchestratorService | null = null;

export function getBotOrchestratorInstance(): BotOrchestratorService {
  if (!botOrchestratorInstance) {
    try {
      // Ensure dependent services are initialized first
      getLiveKitBotServiceInstance();
      getAudioProcessorServiceInstance();
      getNluServiceInstance();
      // getTtsServiceInstance(); // TODO

      botOrchestratorInstance = new BotOrchestratorService();
    } catch (error) {
      getTtsServiceInstance();

      console.error("Failed to initialize BotOrchestratorService:", error);
      throw error; 
    }
  }
  return botOrchestratorInstance;
}

// --- Functions to be called externally (e.g., from Remix server) ---

export async function initializeBotServices() {
    // This ensures all singleton services are created in the correct order
    getBotOrchestratorInstance(); 
    console.log("Bot services initialized.");
}

export async function triggerBotJoin(roomName: string) {
    if (!roomName) {
        console.error("[Trigger Bot Join] Room name is required.");
        return;
    }
    const orchestrator = getBotOrchestratorInstance();
    await orchestrator.joinRoom(roomName);
}

export async function triggerBotLeave(roomName: string) {
    if (!roomName) {
        console.error("[Trigger Bot Leave] Room name is required.");
        return;
    }
    const orchestrator = getBotOrchestratorInstance();
    await orchestrator.leaveRoom(roomName);
}