/**
 * Server entry point for the Voice Assistant Bot Service
 * This file is designed to run in its own Node.js process
 */
import { initializeBotServices } from './bot/index.js';

// Log server information
console.log('Starting Voice Assistant Bot Service...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`LiveKit URL: ${process.env.LIVEKIT_URL ? '✓ Set' : '✗ Not set'}`);
console.log(`LiveKit API Key: ${process.env.LIVEKIT_KEY ? '✓ Set' : '✗ Not set'}`);
console.log(`LiveKit API Secret: ${process.env.LIVEKIT_SECRET ? '✓ Set' : '✗ Not set'}`);
console.log(`Replicate API Token: ${process.env.REPLICATE_API_TOKEN ? '✓ Set' : '✗ Not set'}`);
console.log(`Ultravox Model Version: ${process.env.ULTRAVOX_MODEL_VERSION ? '✓ Set' : '✗ Not set'}`);
console.log(`Play.ht User ID: ${process.env.PLAYHT_USER_ID ? '✓ Set' : '✗ Not set'}`);
console.log(`Play.ht Secret Key: ${process.env.PLAYHT_SECRET_KEY ? '✓ Set' : '✗ Not set'}`);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT signal. Shutting down Bot Service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal. Shutting down Bot Service...');
  process.exit(0);
});

// Use IIFE pattern to allow top-level await in older Node versions
(async function startServer() {
  try {
    // Initialize all bot services
    await initializeBotServices();
    console.log('Voice Assistant Bot Service initialized successfully');
    
    // Keep the process running
    console.log('Bot Service is now ready to join LiveKit rooms on demand');
    console.log('Press Ctrl+C to shut down');
  } catch (error) {
    console.error('Failed to initialize Bot Service:', error);
    process.exit(1);
  }
})();