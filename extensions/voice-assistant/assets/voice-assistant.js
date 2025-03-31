/**
 * Voice AI Shopping Assistant for Shopify
 * 
 * This script provides voice recognition and natural language processing
 * to allow customers to search for products and get recommendations
 * using their voice with an interactive visualizer.
 */

// Import modules
import { VoiceAssistantVisualizer } from './voice-assistant-visualizer.js';
import { VoiceAssistantUI } from './voice-assistant-ui.js';

/**
 * Main Voice Assistant Controller
 * This class orchestrates the UI, visualization, and integration components
 */
class VoiceAssistant {
  constructor() {
    // Core components
    this.ui = null;
    this.visualizer = null;
    this.integration = null;
    
    // State
    this.isInitialized = false;
    this.container = null;
    this.shopDomain = '';
    this.recordingTimeout = null;
    
    // Bind methods to ensure proper 'this' context
    this.init = this.init.bind(this);
    this.startListening = this.startListening.bind(this);
    this.stopListening = this.stopListening.bind(this);
    this.destroy = this.destroy.bind(this);
  }
  
  /**
   * Initialize the Voice Assistant components
   */
  init() {
    // Prevent double initialization
    if (this.isInitialized) {
      console.warn('[VA] Already initialized. Skipping init.');
      return;
    }
    
    console.log('[VA] Initializing Voice Assistant...');
    
    // Get main container
    this.container = document.getElementById('voice-assistant');
    if (!this.container) {
      console.error('[VA] Container element not found. Cannot initialize.');
      return;
    }
    
    // Get shop domain from data attribute
    this.shopDomain = this.container.dataset.shopDomain;
    if (!this.shopDomain) {
      console.warn('[VA] Shop domain not provided in data attribute.');
    }
    
    // Initialize UI component
    this.ui = new VoiceAssistantUI();
    const uiInitialized = this.ui.init({
      container: this.container,
      onRecordStart: this.startListening,
      onRecordStop: this.stopListening
    });
    
    if (!uiInitialized) {
      console.error('[VA] Failed to initialize UI component.');
      return;
    }
    
    // Initialize visualizer component with canvas
    const canvas = document.getElementById('voice-assistant-canvas');
    this.visualizer = new VoiceAssistantVisualizer(canvas);
    this.visualizer.init();
    
    // Initialize integration with LiveKit
    this.initializeIntegration();
    
    // Mark as initialized
    this.isInitialized = true;
    console.log('[VA] Initialization complete.');
  }
  
  /**
   * Initialize the integration with LiveKit
   */
  async initializeIntegration() {
    // Use Promise to ensure we properly handle async initialization
    return new Promise((resolve, reject) => {
      try {
        // Try to get VoiceAssistantIntegration from window (set by voice-assistant-integration.js)
        if (window.VoiceAssistantIntegration) {
          console.log('[VA] Using VoiceAssistantIntegration from window.');
          this.integration = new window.VoiceAssistantIntegration(this.shopDomain);
          
          // Connect visualization data
          this.setupVisualizationBridge();
          resolve(true);
        } else {
          // If not available, try dynamic import (development mode)
          console.log('[VA] VoiceAssistantIntegration not found in window, attempting import...');
          import('./voice-assistant-integration.js')
            .then(module => {
              console.log('[VA] Successfully imported VoiceAssistantIntegration module.');
              this.integration = new module.VoiceAssistantIntegration(this.shopDomain);
              
              // Connect visualization data
              this.setupVisualizationBridge();
              resolve(true);
            })
            .catch(error => {
              console.error('[VA] Failed to import integration module:', error);
              this.ui.handleError('Could not initialize voice service. Please try refreshing the page.');
              reject(error);
            });
        }
      } catch (error) {
        console.error('[VA] Error initializing integration:', error);
        this.ui.handleError('Could not initialize voice service. Please try refreshing the page.');
        reject(error);
      }
    });
  }
  
  /**
   * Set up bridge between integration audio data and visualizer
   */
  setupVisualizationBridge() {
    if (!this.integration || !this.visualizer) return;
    
    // Set up callback to receive frequency data from integration
    this.integration.setVisualizerDataCallback(data => {
      this.visualizer.updateWithFrequencyData(data);
    });
  }
  
  /**
   * Start listening for voice input
   */
  async startListening() {
    try {
      console.log('[VA] Starting voice listening...');
      
      // Show listening state in visualizer
      this.visualizer.setListeningState(true);
      
      // Start audio through the integration
      const success = await this.integration.startListening();
      
      if (!success) {
        throw new Error('Failed to start audio capture');
      }
      
      // Set a timeout to automatically stop listening after 10 seconds
      this.recordingTimeout = setTimeout(() => {
        console.log('[VA] Recording timeout reached (10s).');
        if (this.ui.isListening) { // Check state before stopping
          this.stopListening();
        }
      }, 10000);
      
    } catch (error) {
      console.error('[VA] Error starting voice listening:', error);
      this.ui.handleError('Could not access microphone. Please check your permissions.');
      this.visualizer.setListeningState(false);
    }
  }
  
  /**
   * Stop listening for voice input
   */
  stopListening() {
    console.log('[VA] Stopping voice listening...');
    
    // Clear the automatic stop timeout if it exists
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }
    
    // Update visualizer state
    this.visualizer.setListeningState(false);
    
    // Stop the integration
    if (this.integration) {
      this.integration.stopListening();
    } else {
      console.warn('[VA] Integration not available for stopListening.');
    }
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    console.log('[VA] Destroying Voice Assistant...');
    
    // Clear any active timeouts
    if (this.recordingTimeout) {
      clearTimeout(this.recordingTimeout);
      this.recordingTimeout = null;
    }
    
    // Destroy components
    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }
    
    if (this.visualizer) {
      this.visualizer.destroy();
      this.visualizer = null;
    }
    
    // Stop the integration if active
    if (this.integration) {
      this.integration.stopListening();
      this.integration = null;
    }
    
    this.isInitialized = false;
    console.log('[VA] Voice assistant resources cleaned up.');
  }
}

// Initialize the Voice Assistant when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Add a global error handler to identify where errors are coming from
  window.addEventListener('error', (event) => {
    console.error('Global error caught:', event);
    if (event.message && event.message.includes('language-not-supported')) {
      console.error('Speech recognition error source:', event.filename, 'Line:', event.lineno);
      // Prevent the error from propagating
      event.preventDefault();
      return true;
    }
  });
  
  // Create and initialize the Voice Assistant
  const voiceAssistant = new VoiceAssistant();
  
  // Initialize the voice assistant only if not already done
  if (!window.voiceAssistantInitialized) {
    voiceAssistant.init();
    window.voiceAssistantInitialized = true;
    
    // Store instance for potential external access
    window.voiceAssistant = voiceAssistant;
  } else {
    console.warn('[VA] Attempted to initialize Voice Assistant again. Skipping.');
  }
  
  // Handle page unload to clean up resources
  window.addEventListener('beforeunload', () => {
    if (voiceAssistant.isInitialized) {
      voiceAssistant.destroy();
    }
  });
});