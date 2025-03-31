/**
 * LiveKit Proxy Connection Test Script
 * 
 * This script tests the connection to the LiveKit proxy server, which is essential
 * for the Voice Assistant to function properly.
 * 
 * Run this script using: `node scripts/test-livekit-connection.js`
 * 
 * If successful, it will show "LiveKit proxy is running correctly!"
 * If not, it will show an error message with diagnostics.
 */

import fetch from 'node-fetch';

// LiveKit proxy URL (defaults to localhost:7880)
const LIVEKIT_PROXY_URL = process.env.LIVEKIT_PROXY_URL || 'http://localhost:7880';

async function testLiveKitConnection() {
  console.log(`Testing connection to LiveKit proxy at ${LIVEKIT_PROXY_URL}`);
  console.log('----------------------------------------');
  
  try {
    // Test health endpoint
    console.log('Testing health endpoint...');
    const healthResponse = await fetch(`${LIVEKIT_PROXY_URL}/health`);
    
    if (!healthResponse.ok) {
      console.error(`❌ Health check failed: ${healthResponse.status} ${healthResponse.statusText}`);
      return false;
    }
    
    const healthData = await healthResponse.json();
    console.log('✅ Health check response:', healthData);
    
    // Test SSE connection
    console.log('\nTesting SSE connection...');
    const sseResponse = await fetch(`${LIVEKIT_PROXY_URL}?stream=true&shop=test-shop.myshopify.com`);
    
    if (!sseResponse.ok) {
      console.error(`❌ SSE connection failed: ${sseResponse.status} ${sseResponse.statusText}`);
      return false;
    }
    
    console.log('✅ SSE connection established successfully');
    
    // Additional checks for required environment variables
    console.log('\nChecking required environment variables:');
    if (!process.env.REPLICATE_API_TOKEN) {
      console.warn('⚠️ REPLICATE_API_TOKEN not set. Voice transcription will not work.');
    } else {
      console.log('✅ REPLICATE_API_TOKEN is set');
    }
    
    if (!process.env.ULTRAVOX_MODEL_VERSION) {
      console.warn('⚠️ ULTRAVOX_MODEL_VERSION not set. Voice transcription will not work.');
    } else {
      console.log('✅ ULTRAVOX_MODEL_VERSION is set');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Connection test failed with error:', error.message);
    console.log('\nDiagnostic information:');
    console.log('- Is the LiveKit proxy server running? Try: node scripts/start-livekit-proxy.js');
    console.log('- Check if port 7880 is available or if another service is using it');
    console.log('- Verify your network connection and firewall settings');
    return false;
  }
}

// Run the test
testLiveKitConnection()
  .then(success => {
    console.log('\n----------------------------------------');
    if (success) {
      console.log('🎉 LiveKit proxy is running correctly!');
      console.log('The Voice Assistant should work properly.');
    } else {
      console.log('❌ LiveKit proxy connection test failed.');
      console.log('Please address the errors above to get the Voice Assistant working.');
    }
  })
  .catch(error => {
    console.error('Test script error:', error);
  }); 