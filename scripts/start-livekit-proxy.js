/**
 * Script to start the LiveKit proxy server locally
 * This allows running the proxy outside of Docker for development
 */
import { initLiveKitProxy } from '../app/livekit-proxy.server.js';

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down LiveKit proxy server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down LiveKit proxy server...');
  process.exit(0);
});

// Start the server
console.log('Starting LiveKit proxy server...');
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Replicate API Token: ${process.env.REPLICATE_API_TOKEN ? '✓ Set' : '✗ Not set'}`);
console.log(`Ultravox Model Version: ${process.env.ULTRAVOX_MODEL_VERSION ? '✓ Set' : '✗ Not set'}`);

// Use IIFE pattern to allow top-level await
(async function startServer() {
  try {
    await initLiveKitProxy();
    console.log('LiveKit proxy server started successfully on port 7880');
  } catch (error) {
    console.error('Failed to start LiveKit proxy server:', error);
    process.exit(1);
  }
})();