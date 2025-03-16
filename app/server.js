/**
 * Server entry point for LiveKit proxy
 * This file is designed to run in its own Node.js process
 */
import { initLiveKitProxy } from './livekit-proxy.server.js';

// Log server information
console.log('Starting LiveKit proxy server...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Replicate API Token: ${process.env.REPLICATE_API_TOKEN ? '✓ Set' : '✗ Not set'}`);
console.log(`Ultravox Model Version: ${process.env.ULTRAVOX_MODEL_VERSION ? '✓ Set' : '✗ Not set'}`);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Received SIGINT signal. Shutting down LiveKit proxy server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM signal. Shutting down LiveKit proxy server...');
  process.exit(0);
});

// Use IIFE pattern to allow top-level await in older Node versions
(async function startServer() {
  try {
    // Start the LiveKit proxy server
    const server = await initLiveKitProxy();
    console.log('LiveKit proxy server started successfully');
  } catch (error) {
    console.error('Failed to start LiveKit proxy server:', error);
    process.exit(1);
  }
})();