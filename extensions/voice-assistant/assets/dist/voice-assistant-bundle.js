/**
 * Voice Assistant Visualizer
 * 
 * This module handles the audio visualization components of the voice assistant,
 * creating an interactive and responsive visual representation of audio data.
 */

class VoiceAssistantVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.animationFrame = null;
    this.previousData = null;
    this.dummyDataPhase = 0;
    this.isListening = false;
  }

  /**
   * Initialize the visualizer with the given canvas
   * @param {HTMLCanvasElement} canvas - The canvas element for drawing
   */
  init(canvas) {
    if (!this.canvas && canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    }

    // Make sure we have a canvas to work with
    if (!this.canvas || !this.ctx) {
      console.error('[Visualizer] No canvas available for visualization');
      return false;
    }

    // Set canvas dimensions
    this.canvas.width = 280;
    this.canvas.height = 280;

    // Start the visualization
    this.start();
    return true;
  }

  /**
   * Start the visualizer animation loop
   */
  start() {
    if (!this.canvas || !this.ctx) return;
    
    // Start animation loop
    this.startAnimation();
  }

  /**
   * Stop the visualizer animation
   */
  stop() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Set whether the visualizer is in listening mode
   * @param {boolean} isListening - Whether the assistant is actively listening
   */
  setListeningState(isListening) {
    this.isListening = isListening;
  }

  /**
   * Update the visualizer with new audio data
   * @param {Uint8Array} frequencyData - Raw frequency data from audio analyzer
   */
  updateWithFrequencyData(frequencyData) {
    if (!frequencyData) return;
    
    const processedData = this.processFrequencyData(frequencyData);
    this.previousData = processedData;
  }

  /**
   * Start the animation loop for the visualizer
   */
  startAnimation() {
    if (!this.canvas || !this.ctx) return;

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;
    const barWidth = 4; // Thinner bars
    const totalBars = 128;

    const draw = () => {
      this.animationFrame = requestAnimationFrame(draw);

      // Use real audio data if available, otherwise use dummy data
      let dataArray;
      if (this.isListening && this.previousData) {
        dataArray = this.previousData;
      } else {
        // Generate dummy data
        this.dummyDataPhase += 0.02;
        const frequency = 0.1;
        dataArray = new Float32Array(totalBars);
        for (let i = 0; i < totalBars; i++) {
          // Create more varied waveforms with multiple sine functions
          const x1 = i * frequency + this.dummyDataPhase;
          const x2 = i * frequency * 1.5 + this.dummyDataPhase * 0.8;
          const value1 = Math.sin(x1) * 0.5 + 0.5;
          const value2 = Math.sin(x2) * 0.25 + 0.25;
          dataArray[i] = Math.min(1.0, value1 + value2);
        }
      }

      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.globalCompositeOperation = 'lighter';

      // Use more vivid colors with increased opacity to match the demo
      const colors = [
        'rgba(251, 191, 36, 0.3)', // Amber
        'rgba(236, 72, 153, 0.3)',  // Pink
        'rgba(5, 150, 105, 0.3)',   // Emerald
        'rgba(139, 92, 246, 0.3)',  // Violet
      ];

      const startAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
      const angleCoverage = (6 * Math.PI) / 4;

      for (let i = 0; i < 4; i++) {
        const startAngle = startAngles[i];
        const endAngle = (startAngle + angleCoverage) % (2 * Math.PI);
        const reverse = (i % 2 === 0);

        // Add slight offset to each quarter for more interesting visual
        const dataOffset = i * 5;

        this.drawQuarter(
          this.ctx,
          centerX,
          centerY,
          radius,
          barWidth,
          totalBars,
          startAngle,
          endAngle,
          colors[i],
          colors[(i + 1) % colors.length], // Blend between colors
          dataArray,
          dataOffset,
          reverse
        );
      }

      // Add inner glow
      const innerRadius = radius * 0.38;
      const gradient = this.ctx.createRadialGradient(
        centerX, centerY, innerRadius * 0.5,
        centerX, centerY, innerRadius
      );
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();
    };

    draw();
  }

  /**
   * Draw one quarter of the circular visualizer
   */
  drawQuarter(
    ctx,
    centerX,
    centerY,
    radius,
    barWidth,
    totalBars,
    startAngle,
    endAngle,
    color1,
    color2,
    data,
    dataOffset = 0,
    reverse = false
  ) {
    const angleDiff = (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
    const angleStep = angleDiff / totalBars;

    for (let i = 0; i < totalBars; i++) {
      let index;
      if (reverse) {
        index = (data.length - 1 - ((i + dataOffset) % data.length));
      } else {
        index = (i + dataOffset) % data.length;
      }
      const value = data[index];
      const barHeight = value * (radius * 0.6);

      const angle = startAngle + i * angleStep;
      const normalizedAngle = angle % (2 * Math.PI);

      const innerRadius = radius * 0.4;
      const outerRadius = innerRadius + barHeight;

      const x1 = centerX + Math.cos(normalizedAngle) * innerRadius;
      const y1 = centerY + Math.sin(normalizedAngle) * innerRadius;
      const x2 = centerX + Math.cos(normalizedAngle) * outerRadius;
      const y2 = centerY + Math.sin(normalizedAngle) * outerRadius;

      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);

      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = barWidth;
      ctx.lineCap = 'round';
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }

  /**
   * Helper functions for data processing
   */
  normalizeData(data) {
    const normalized = new Float32Array(data.length);
    const minHeight = 0;
    const maxHeight = 0.9;
    const range = maxHeight - minHeight;

    for (let i = 0; i < data.length; i++) {
      normalized[i] = minHeight + (data[i] * range);
    }

    return normalized;
  }

  smoothData(data) {
    const smoothed = new Float32Array(data.length);
    const smoothingFactor = 0.9;

    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      let count = 0;

      for (let j = Math.max(0, i - 2); j <= Math.min(data.length - 1, i + 2); j++) {
        sum += data[j];
        count++;
      }

      const average = sum / count;
      smoothed[i] = data[i] * (1 - smoothingFactor) + average * smoothingFactor;
    }

    return smoothed;
  }

  processFrequencyData(data) {
    const processed = new Float32Array(data.length);

    for (let i = 0; i < data.length; i++) {
      let normalizedValue = data[i] / 255;
      const frequencyBoost = Math.pow((data.length - i) / data.length, 0.5);
      normalizedValue = normalizedValue * (1 + frequencyBoost * 2);
      processed[i] = Math.min(Math.max(normalizedValue, 0), 1);

      if (this.previousData) {
        processed[i] = processed[i] * 0.3 + this.previousData[i] * 0.7;
      }
    }

    const normalized = this.normalizeData(processed);
    const smoothed = this.smoothData(normalized);

    return smoothed;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.stop();
    this.canvas = null;
    this.ctx = null;
    this.previousData = null;
  }
}

/**
 * Voice Assistant UI Manager
 * 
 * This module handles the UI components of the voice assistant including
 * modal controls, message display, and user interactions.
 */

class VoiceAssistantUI {
  constructor() {
    // UI elements
    this.container = null;
    this.modal = null;
    this.canvas = null;
    this.visualizer = null;
    this.closeButton = null;
    this.recordButton = null;
    this.loadingElement = null;
    this.messagesContainer = null;
    this.chatBubbleMessage = null;
    this.assistantNameElement = null;
    
    // State
    this.hasInteracted = false;
    this.isLoading = false;
    this.isListening = false;
    
    // Name cycling
    this.names = [
      'Oliver', 'Charlotte', 'Noah', 'Amelia', 'Liam', 
      'Ava', 'William', 'Sophia', 'James', 'Isabella',
      'Benjamin', 'Mia', 'Lucas', 'Harper', 'Henry',
      'Evelyn', 'Alexander', 'Abigail', 'Mason', 'Emily'
    ];
    this.currentName = 'Shopping Assistant';
    this.nameInterval = null;
  }

  /**
   * Initialize the UI components
   * @param {Object} config - Configuration options
   * @param {HTMLElement} config.container - The main container element
   * @param {Function} config.onRecordStart - Callback when recording starts
   * @param {Function} config.onRecordStop - Callback when recording stops
   */
  init(config) {
    const { container, onRecordStart, onRecordStop } = config;
    
    if (!container) {
      console.error('[VA UI] Container element not provided');
      return false;
    }
    
    this.container = container;
    this.onRecordStart = onRecordStart || (() => {});
    this.onRecordStop = onRecordStop || (() => {});
    
    // Find UI elements
    this.findElements();
    
    // Apply theme color if provided
    this.applyTheme();
    
    // Attach event listeners
    this.attachEventListeners();
    
    // Start name cycling animation
    this.startNameCycling();
    
    console.log('[VA UI] UI initialization complete');
    return true;
  }
  
  /**
   * Find all required UI elements in the DOM
   */
  findElements() {
    this.canvas = document.getElementById('voice-assistant-canvas');
    this.visualizer = this.container.querySelector('.voice-assistant-visualizer');
    this.modal = this.container.querySelector('.voice-assistant-modal');
    this.closeButton = this.container.querySelector('.voice-assistant-close');
    this.recordButton = this.container.querySelector('.voice-assistant-record');
    this.messagesContainer = this.container.querySelector('.voice-assistant-messages');
    this.loadingElement = document.getElementById('voice-assistant-loading');
    this.chatBubbleMessage = document.getElementById('voice-assistant-chat-message');
    this.assistantNameElement = document.getElementById('voice-assistant-name');
  }
  
  /**
   * Apply theme color from data attribute
   */
  applyTheme() {
    const color = this.container.dataset.color;
    if (color) {
      document.documentElement.style.setProperty('--assistant-color', color);
    }
  }
  
  /**
   * Attach event listeners to UI elements
   */
  attachEventListeners() {
    // Make visualizer clickable
    this.visualizer.addEventListener('click', () => {
      this.handleVisualizerClick();
    });
    
    // Close modal when close button is clicked
    this.closeButton.addEventListener('click', () => {
      this.closeModal();
    });
    
    // Start/stop listening when record button is clicked
    this.recordButton.addEventListener('click', () => {
      console.log(`[VA UI] Record button clicked. Current state: isListening = ${this.isListening}`);
      if (this.isListening) {
        this.stopListening();
      } else {
        this.startListening();
      }
    });
    
    // Close modal when clicking outside
    document.addEventListener('click', (event) => {
      if (this.modal.classList.contains('open') && 
          !this.container.contains(event.target)) {
        this.closeModal();
      }
    });
    
    // Listen for voice assistant errors
    document.addEventListener('voice-assistant-error', (event) => {
      console.log('[VA UI] Voice assistant error event received:', event.detail);
      this.handleError(event.detail.message || 'Sorry, there was a problem with the voice service.');
    });
    
    // Listen for voice assistant responses
    document.addEventListener('voice-assistant-response', (event) => {
      console.log('[VA UI] Voice assistant response event received:', event.detail);
      this.handleFinalResponse(event.detail);
    });
  }
  
  /**
   * Start cycling through random names in the assistant name element
   */
  startNameCycling() {
    this.nameInterval = setInterval(() => {
      if (!this.hasInteracted) {
        const randomIndex = Math.floor(Math.random() * this.names.length);
        
        // Fade out then in for smooth name transition
        this.assistantNameElement.style.opacity = '0';
        this.assistantNameElement.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
          this.assistantNameElement.textContent = this.names[randomIndex];
          this.assistantNameElement.style.opacity = '1';
          this.assistantNameElement.style.transform = 'translateY(0)';
        }, 200);
      } else {
        clearInterval(this.nameInterval);
        
        // Fade out then in for final name
        this.assistantNameElement.style.opacity = '0';
        this.assistantNameElement.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
          this.assistantNameElement.textContent = 'Shopping Assistant';
          this.assistantNameElement.style.opacity = '1';
          this.assistantNameElement.style.transform = 'translateY(0)';
        }, 200);
      }
    }, 2000);
  }
  
  /**
   * Stop name cycling
   */
  stopNameCycling() {
    if (this.nameInterval) {
      clearInterval(this.nameInterval);
      this.nameInterval = null;
    }
    
    // Set final name
    this.assistantNameElement.textContent = 'Shopping Assistant';
  }
  
  /**
   * Handle click on the visualizer
   */
  handleVisualizerClick() {
    if (!this.hasInteracted) {
      this.hasInteracted = true;
      this.setLoading(true);
      
      // Stop name cycling and set to Shopping Assistant
      this.stopNameCycling();
      
      // Clear message and show welcome
      setTimeout(() => {
        this.updateChatBubbleMessage('How can I help you shop today?');
        this.setLoading(false);
        this.openModal();
      }, 1000);
      
      return;
    }
    
    // If already interacted, toggle modal
    this.toggleModal();
  }
  
  /**
   * Set the loading state
   * @param {boolean} isLoading - Whether the assistant is in loading state
   */
  setLoading(isLoading) {
    this.isLoading = isLoading;
    if (isLoading) {
      this.loadingElement.classList.remove('hidden');
    } else {
      this.loadingElement.classList.add('hidden');
    }
  }
  
  /**
   * Update the chat bubble message with animation
   * @param {string} text - The new message text
   */
  updateChatBubbleMessage(text) {
    if (this.chatBubbleMessage) {
      // Get the parent bubble for additional animations
      const bubble = this.chatBubbleMessage.closest('.voice-assistant-chat-bubble');
      
      // Apply fade and transform for transition
      if (bubble) {
        bubble.style.opacity = '0';
        bubble.style.transform = 'translateY(10px)';
      } else {
        this.chatBubbleMessage.style.opacity = '0';
      }
      
      setTimeout(() => {
        this.chatBubbleMessage.textContent = text;
        
        if (bubble) {
          bubble.style.opacity = '1';
          bubble.style.transform = 'translateY(0)';
        } else {
          this.chatBubbleMessage.style.opacity = '1';
        }
      }, 300);
    }
  }
  
  /**
   * Toggle the modal open/closed
   */
  toggleModal() {
    if (this.modal.classList.contains('open')) {
      this.closeModal();
    } else {
      this.openModal();
    }
  }
  
  /**
   * Open the modal
   */
  openModal() {
    this.modal.classList.add('open');
    // Welcome message if this is the first time opening
    if (this.messagesContainer.children.length === 1) {
      setTimeout(() => {
        this.addMessage("You can ask me to find products, check prices, or provide recommendations.", 'assistant');
      }, 500);
    }
  }
  
  /**
   * Close the modal
   */
  closeModal() {
    this.modal.classList.remove('open');
    if (this.isListening) {
      console.log('[VA UI] Closing modal while listening, calling stopListening...');
      this.stopListening();
    }
  }
  
  /**
   * Start listening for voice input
   */
  startListening() {
    console.log('[VA UI] startListening called.');
    // Show listening state immediately for better UX
    this.isListening = true;
    this.recordButton.classList.add('recording');
    this.recordButton.querySelector('span').textContent = 'Listening...';
    this.updateChatBubbleMessage('I\'m listening...');
    
    // Call the provided callback
    this.onRecordStart();
  }
  
  /**
   * Stop listening for voice input
   */
  stopListening() {
    if (!this.isListening) {
      console.log('[VA UI] stopListening called but already stopped.');
      return;
    }
    
    console.log('[VA UI] stopListening called.');
    
    // Update UI state
    this.isListening = false;
    this.recordButton.classList.remove('recording');
    this.recordButton.querySelector('span').textContent = 'Tap to speak';
    
    // Add a loading message to indicate processing
    this.addMessage('Processing...', 'assistant');
    this.updateChatBubbleMessage('Processing...');
    this.setLoading(true);
    
    // Call the provided callback
    this.onRecordStop();
  }
  
  /**
   * Add a message to the conversation
   * @param {string} text - Message text
   * @param {string} sender - Sender ('user' or 'assistant')
   */
  addMessage(text, sender) {
    // Add to modal message container
    const messageEl = document.createElement('div');
    messageEl.classList.add('message', sender);
    messageEl.textContent = text;
    this.messagesContainer.appendChild(messageEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    
    // Update chat bubble if it's from assistant
    if (sender === 'assistant') {
      this.updateChatBubbleMessage(text);
    }
  }
  
  /**
   * Handle error messages
   * @param {string} errorMessage - Error message to display
   */
  handleError(errorMessage) {
    console.log(`[VA UI] handleError called with message: "${errorMessage}"`);
    // Stop listening if active
    if (this.isListening) {
      console.log('[VA UI] Stopping listening due to error.');
      this.stopListening();
    }
    
    // Remove loading state if active
    this.setLoading(false);
    
    // Show error message
    this.addMessage(errorMessage, 'assistant');
  }
  
  /**
   * Handle final response from voice assistant
   * @param {Object} response - Response object from backend
   */
  handleFinalResponse(response) {
    console.log('[VA UI] handleFinalResponse called with:', response);
    // Remove the loading message ("Processing...")
    if (this.messagesContainer.lastChild && this.messagesContainer.lastChild.textContent === 'Processing...') {
      this.messagesContainer.removeChild(this.messagesContainer.lastChild);
    }
    
    this.addMessage(response.message || "I received a response, but it was empty.", 'assistant');
    this.setLoading(false);
    
    // Handle any actions returned from the AI
    if (response.action === 'search' && response.query) {
      console.log(`[VA UI] Executing search action for query: "${response.query}"`);
      window.location.href = `/search?q=${encodeURIComponent(response.query)}`;
    } else if (response.action === 'product' && response.handle) {
       console.log(`[VA UI] Executing product navigation action for handle: "${response.handle}"`);
      window.location.href = `/products/${response.handle}`;
    } else if (response.action === 'collection' && response.handle) {
       console.log(`[VA UI] Executing collection navigation action for handle: "${response.handle}"`);
      window.location.href = `/collections/${response.handle}`;
    } else if (response.action && response.action !== 'none') {
        console.warn(`[VA UI] Received unknown action: "${response.action}"`);
    }
  }
  
  /**
   * Detect if user is on a mobile device
   * @returns {boolean} Whether the user is on a mobile device
   */
  detectMobileDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    
    // Check for common mobile patterns
    if (/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())) {
      return true;
    }
    
    // iOS detection needs special handling
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) {
      return true;
    }
    
    // Check screen size as a fallback
    if (window.innerWidth <= 800 && window.innerHeight <= 900) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    console.log('[VA UI] Destroying VoiceAssistantUI...');
    
    if (this.nameInterval) {
      clearInterval(this.nameInterval);
      this.nameInterval = null;
    }
    
    console.log('[VA UI] Voice assistant UI resources cleaned up.');
  }
}

/**
 * Voice AI Shopping Assistant for Shopify
 * 
 * This script provides voice recognition and natural language processing
 * to allow customers to search for products and get recommendations
 * using their voice with an interactive visualizer.
 */


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
          import('./voice-assistant-integration-CfXcAbCS.js')
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
