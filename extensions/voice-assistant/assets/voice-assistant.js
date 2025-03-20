/**
 * Voice AI Shopping Assistant for Shopify
 * 
 * This script provides voice recognition and natural language processing
 * to allow customers to search for products and get recommendations
 * using their voice with an interactive visualizer.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Add a global error handler to identify where "language-not-supported" errors are coming from
  window.addEventListener('error', (event) => {
    console.error('Global error caught:', event);
    if (event.message && event.message.includes('language-not-supported')) {
      console.error('Speech recognition error source:', event.filename, 'Line:', event.lineno);
      // Prevent the error from propagating
      event.preventDefault();
      return true;
    }
  });
  
  // Get VoiceAssistantIntegration from window (added by the script tag)
  const VoiceAssistantIntegration = window.VoiceAssistantIntegration;

  // Initialize the Voice Assistant
  const VoiceAssistant = {
    container: document.getElementById('voice-assistant'),
    modal: null,
    canvas: null,
    visualizer: null,
    closeButton: null,
    recordButton: null,
    loadingElement: null,
    messagesContainer: null,
    chatBubbleMessage: null,
    assistantNameElement: null,
    recognition: null,
    isListening: false,
    shopDomain: '',
    
    // Visualizer references
    audioContext: null,
    analyser: null,
    sourceNode: null,
    animationFrame: null,
    previousData: null,
    dummyDataPhase: 0,
    
    // State tracking
    hasInteracted: false,
    isLoading: false,
    isCallActive: false,
    
    // LiveKit integration
    voiceIntegration: null,
    
    // Random names for dynamic display
    names: [
      'Oliver', 'Charlotte', 'Noah', 'Amelia', 'Liam', 
      'Ava', 'William', 'Sophia', 'James', 'Isabella',
      'Benjamin', 'Mia', 'Lucas', 'Harper', 'Henry',
      'Evelyn', 'Alexander', 'Abigail', 'Mason', 'Emily'
    ],
    currentName: 'Shopping Assistant',
    nameInterval: null,
    
    init() {
      if (!this.container) return;
      
      // Get container elements
      this.canvas = document.getElementById('voice-assistant-canvas');
      this.visualizer = this.container.querySelector('.voice-assistant-visualizer');
      this.modal = this.container.querySelector('.voice-assistant-modal');
      this.closeButton = this.container.querySelector('.voice-assistant-close');
      this.recordButton = this.container.querySelector('.voice-assistant-record');
      this.messagesContainer = this.container.querySelector('.voice-assistant-messages');
      this.loadingElement = document.getElementById('voice-assistant-loading');
      this.chatBubbleMessage = document.getElementById('voice-assistant-chat-message');
      this.assistantNameElement = document.getElementById('voice-assistant-name');
      
      // Get shop domain from data attribute
      this.shopDomain = this.container.dataset.shopDomain;
      
      // Set assistant color theme
      const color = this.container.dataset.color;
      if (color) {
        document.documentElement.style.setProperty('--assistant-color', color);
      }
      
      // Initialize the VoiceAssistantIntegration with shop domain
      this.voiceIntegration = new VoiceAssistantIntegration(this.shopDomain);
      
      // Connect visualization data
      this.voiceIntegration.setVisualizerDataCallback((data) => {
        const processedData = this.processFrequencyData(data);
        // The processed data will be used by the visualization code in the next animation frame
        this.previousData = processedData;
      });
      
      // Start visualizer with dummy data
      this.startVisualizerWithDummyData();
      
      // Start random name cycling
      this.startNameCycling();
      
      // Initialize API endpoints
      this.initApiEndpoints().catch(error => {
        console.warn('Failed to initialize API endpoints:', error);
      });
      
      // Attach event listeners
      this.attachEventListeners();
    },
    
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
    },
    
    // Helper functions for data processing
    normalizeData(data) {
      const normalized = new Float32Array(data.length);
      const minHeight = 0;
      const maxHeight = 0.9;
      const range = maxHeight - minHeight;

      for (let i = 0; i < data.length; i++) {
        normalized[i] = minHeight + (data[i] * range);
      }

      return normalized;
    },

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
    },

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

      this.previousData = smoothed;
      return smoothed;
    },

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
    },

    startVisualizerWithDummyData() {
      if (!this.canvas) return;

      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;

      // Ensure canvas dimensions are properly set
      this.canvas.width = 280;
      this.canvas.height = 280;

      const centerX = this.canvas.width / 2;
      const centerY = this.canvas.height / 2;
      const radius = Math.min(centerX, centerY) - 10;
      const barWidth = 4; // Thinner bars like in the demo
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

        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.globalCompositeOperation = 'lighter';

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
            ctx,
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
        const gradient = ctx.createRadialGradient(
          centerX, centerY, innerRadius * 0.5,
          centerX, centerY, innerRadius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      };

      draw();
    },
    
    handleVisualizerClick() {
      if (!this.hasInteracted) {
        this.hasInteracted = true;
        this.setLoading(true);
        
        // Stop name cycling and set to Shopping Assistant
        clearInterval(this.nameInterval);
        this.assistantNameElement.textContent = 'Shopping Assistant';
        
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
    },
    
    setLoading(isLoading) {
      this.isLoading = isLoading;
      if (isLoading) {
        this.loadingElement.classList.remove('hidden');
      } else {
        this.loadingElement.classList.add('hidden');
      }
    },
    
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
    },
    
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
        console.log('Voice assistant error event received:', event.detail);
        this.handleError(event.detail.message || 'Sorry, there was a problem with the voice service.');
      });
      
      // Listen for voice assistant responses
      document.addEventListener('voice-assistant-response', (event) => {
        console.log('Voice assistant response event received:', event.detail);
        this.handleFinalResponse(event.detail);
      });
    },
    
    toggleModal() {
      if (this.modal.classList.contains('open')) {
        this.closeModal();
      } else {
        this.openModal();
      }
    },
    
    openModal() {
      this.modal.classList.add('open');
      // Welcome message if this is the first time opening
      if (this.messagesContainer.children.length === 1) {
        setTimeout(() => {
          this.addMessage("You can ask me to find products, check prices, or provide recommendations.", 'assistant');
        }, 500);
      }
    },
    
    closeModal() {
      this.modal.classList.remove('open');
      if (this.isListening) {
        this.stopListening();
      }
    },
    
    async startListening() {
      try {
        // Show listening state immediately for better UX
        this.isListening = true;
        this.recordButton.classList.add('recording');
        this.recordButton.querySelector('span').textContent = 'Listening...';
        this.updateChatBubbleMessage('I\'m listening...');
        
        // Start audio with the LiveKit integration
        const success = await this.voiceIntegration.startListening();
        
        if (!success) {
          throw new Error('Failed to start audio capture');
        }
        
        // Set a timeout to automatically stop listening after 10 seconds
        this.recordingTimeout = setTimeout(() => {
          if (this.isListening) {
            this.stopListening();
          }
        }, 10000);
      } catch (err) {
        console.error('Error starting audio capture:', err);
        this.isListening = false;
        this.recordButton.classList.remove('recording');
        this.recordButton.querySelector('span').textContent = 'Tap to speak';
        this.addMessage('Could not access microphone. Please check your permissions.', 'assistant');
        this.setLoading(false);
      }
    },
    
    stopListening() {
      try {
        // Clear any timeouts
        if (this.recordingTimeout) {
          clearTimeout(this.recordingTimeout);
          this.recordingTimeout = null;
        }
        
        // Stop audio using the LiveKit integration
        this.voiceIntegration.stopListening();
        
        // Update UI state
        this.isListening = false;
        this.recordButton.classList.remove('recording');
        this.recordButton.querySelector('span').textContent = 'Tap to speak';
        
        // Add a loading message to indicate processing
        this.addMessage('Processing...', 'assistant');
        this.updateChatBubbleMessage('Processing...');
        this.setLoading(true);
        
        // Response will come through WebSocket via the 'voice-assistant-response' event
        // No need for setTimeout with simulated response anymore
      } catch (err) {
        console.error('Error stopping recording:', err);
      }
    },
    
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
    },
    
    handleError(errorMessage) {
      // Stop listening if active
      if (this.isListening) {
        this.isListening = false;
        this.recordButton.classList.remove('recording');
        this.recordButton.querySelector('span').textContent = 'Tap to speak';
      }
      
      // Remove loading state if active
      this.setLoading(false);
      
      // Show error message
      this.addMessage(errorMessage, 'assistant');
    },
    
    // Initialize API endpoints through Shopify App Proxy
    async initApiEndpoints() {
      // Using Shopify App Proxy format: /{prefix}/{subpath}
      // The app_proxy configuration in shopify.app.toml defines these routes
      
      // The main voice API endpoint - must use the store's domain for App Proxy
      this.apiEndpoint = '/apps/voice';
      
      // The WebSocket endpoint using query param instead of path segment
      const wsEndpoint = '/apps/voice?ws=true';
      
      console.log('Using App Proxy endpoint:', this.apiEndpoint);
      console.log('WebSocket endpoint is set to:', wsEndpoint);
      
      // Log important debug information
      console.log('Shop domain:', this.shopDomain);
      
      // Detect mobile devices
      this.isMobile = this.detectMobileDevice();
      console.log('Mobile device:', this.isMobile ? 'Yes' : 'No');
      
      // Reinitialize voice integration with correct endpoints
      if (this.voiceIntegration) {
        // Update the VoiceAssistantIntegration instance with the correct WebSocket path
        this.voiceIntegration.wsEndpoint = wsEndpoint;
      }
      
      return Promise.resolve({
        apiEndpoint: this.apiEndpoint,
        wsEndpoint: wsEndpoint
      });
    },
    
    // Detect if user is on a mobile device
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
    },
    
    handleFinalResponse(response) {
      // Remove the loading message
      if (this.messagesContainer.lastChild) {
        this.messagesContainer.removeChild(this.messagesContainer.lastChild);
      }
      
      this.addMessage(response.message, 'assistant');
      this.setLoading(false);
      
      // Handle any actions returned from the AI
      if (response.action === 'search') {
        window.location.href = `/search?q=${encodeURIComponent(response.query)}`;
      } else if (response.action === 'product') {
        window.location.href = `/products/${response.handle}`;
      } else if (response.action === 'collection') {
        window.location.href = `/collections/${response.handle}`;
      }
    },
    
    // Clean up resources when needed
    destroy() {
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }
      
      if (this.nameInterval) {
        clearInterval(this.nameInterval);
      }
      
      // Clear any active timeouts
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
      }
      
      // Stop the voice integration if active
      if (this.voiceIntegration) {
        this.voiceIntegration.stopListening();
      }
      
      console.log('Voice assistant resources cleaned up');
    }
  };
  
  // Initialize the voice assistant
  VoiceAssistant.init();
  
  // Handle page unload to clean up resources
  window.addEventListener('beforeunload', () => {
    VoiceAssistant.destroy();
  });
});