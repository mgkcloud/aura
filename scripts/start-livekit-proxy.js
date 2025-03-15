// Create a directory for the scripts
const fs = require('fs');
const path = require('path');

// Make sure the directory exists
if (!fs.existsSync('scripts')) {
  fs.mkdirSync('scripts');
}

// Simple script to start the LiveKit proxy server
// This is useful for running the server directly without Docker
const { initLiveKitProxy } = require('../app/livekit-proxy.server');

console.log('Starting LiveKit proxy server...');
initLiveKitProxy()
  .then(() => {
    console.log('LiveKit proxy server started successfully on port 7880');
  })
  .catch((error) => {
    console.error('Failed to start LiveKit proxy server:', error);
    process.exit(1);
  });

// Keep the process running
process.on('SIGINT', () => {
  console.log('Shutting down LiveKit proxy server...');
  process.exit(0);
});