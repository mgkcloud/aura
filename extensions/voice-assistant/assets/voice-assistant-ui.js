/**
 * Voice Assistant UI Manager
 * 
 * This module handles the UI components of the voice assistant including
 * modal controls, message display, and user interactions.
 */

export class VoiceAssistantUI {
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