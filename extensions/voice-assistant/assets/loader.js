/**
 * Voice Assistant Loader
 * This script loads the voice assistant components in the correct order.
 */

// Load the livekit client library first
function loadScript(src, id, callback) {
  if (document.getElementById(id)) {
    if (callback) callback();
    return;
  }
  
  const script = document.createElement('script');
  script.id = id;
  script.type = 'text/javascript';
  script.src = src;
  script.async = true;
  
  if (callback) {
    script.onload = callback;
  }
  
  script.onerror = (err) => {
    console.error(`Error loading script ${src}:`, err);
  };
  
  document.head.appendChild(script);
}

// Determine the current script path
const currentScriptPath = document.currentScript ? document.currentScript.src : '';
const basePath = currentScriptPath.substring(0, currentScriptPath.lastIndexOf('/') + 1);

// Load livekit client first, then the main bundle
loadScript(`${basePath}livekit-client.js`, 'voice-assistant-livekit', () => {
  console.log('LiveKit client loaded, setting up window.LivekitClient for modules');
  
  // For browser modules, create a dynamic module script tag
  const moduleScript = document.createElement('script');
  moduleScript.type = 'module';
  moduleScript.id = 'voice-assistant-module';
  
  // This code will be executed inline in the module context
  moduleScript.textContent = `
    import * as voiceAssistant from '${basePath}dist/voice-assistant-bundle.js';
    console.log('Voice Assistant modules loaded.');
  `;
  
  // Handle errors
  moduleScript.onerror = (err) => {
    console.error('Error loading Voice Assistant module:', err);
  };
  
  // Append to document
  document.head.appendChild(moduleScript);
}); 