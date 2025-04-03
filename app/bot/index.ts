/**
 * Bot Services Entry Point
 * 
 * Exports functions to initialize and interact with the bot services.
 */

import { getLiveKitBotServiceInstance } from './livekit.service';
import { getAudioProcessorServiceInstance } from './audio.processor';
import { getNluServiceInstance } from './nlu.service';
import { getBotOrchestratorInstance, initializeBotServices, triggerBotJoin, triggerBotLeave } from './bot.orchestrator';
// TODO: Import TTS service exports when created

// Ensure all services are potentially initialized when this module is loaded,
// especially if they rely on singleton patterns.
// Calling the getter functions usually handles the initialization.
getLiveKitBotServiceInstance();
getAudioProcessorServiceInstance();
getNluServiceInstance();
// getTtsServiceInstance(); // TODO
getBotOrchestratorInstance(); 

// Export the main control functions
export {
    initializeBotServices,
    triggerBotJoin,
    triggerBotLeave,
    // Potentially export service instances if direct access is needed elsewhere,
    // but prefer using the orchestrator or specific trigger functions.
    // getLiveKitBotServiceInstance, 
    // getAudioProcessorServiceInstance,
    // getNluServiceInstance,
    // getBotOrchestratorInstance
};