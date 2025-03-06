/**
 * Voice AI Shopping Assistant for Shopify
 * 
 * This script provides voice recognition and natural language processing
 * to allow customers to search for products and get recommendations
 * using their voice with an interactive visualizer.
 */

document.addEventListener('DOMContentLoaded', () => {
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
    apiEndpoint: 'https://your-backend-api.com/voice-assistant',
    
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
      
      // Start visualizer with dummy data
      this.startVisualizerWithDummyData();
      
      // Start random name cycling
      this.startNameCycling();
      
      // Initialize Web Speech API if available
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        this.initSpeechRecognition();
      } else {
        this.updateChatBubbleMessage('Sorry, voice recognition is not supported in your browser.');
      }
      
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

        this.dummyDataPhase += 0.02;
        const frequency = 0.1;
        const dataArray = new Uint8Array(totalBars);
        for (let i = 0; i < totalBars; i++) {
          // Create more varied waveforms with multiple sine functions
          const x1 = i * frequency + this.dummyDataPhase;
          const x2 = i * frequency * 1.5 + this.dummyDataPhase * 0.8;
          const value1 = Math.sin(x1) * 127.5 + 127.5;
          const value2 = Math.sin(x2) * 60 + 60;
          dataArray[i] = Math.min(255, value1 + value2);
        }
        const processedData = this.processFrequencyData(dataArray);

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
            processedData,
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
    
    startVisualizer() {
      // This would be the live audio visualizer, but for now we'll use dummy data
      this.startVisualizerWithDummyData();
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
    
    initSpeechRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
      
      this.recognition.onstart = () => {
        this.isListening = true;
        this.recordButton.classList.add('recording');
        this.recordButton.querySelector('span').textContent = 'Listening...';
        this.updateChatBubbleMessage('I\'m listening...');
      };
      
      this.recognition.onend = () => {
        this.isListening = false;
        this.recordButton.classList.remove('recording');
        this.recordButton.querySelector('span').textContent = 'Tap to speak';
      };
      
      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        this.addMessage(transcript, 'user');
        this.processVoiceCommand(transcript);
      };
      
      this.recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'no-speech') {
          this.addMessage('I didn\'t hear anything. Please try again.', 'assistant');
          this.updateChatBubbleMessage('I didn\'t hear anything. Please try again.');
        } else {
          this.addMessage('Error recognizing speech. Please try again.', 'assistant');
          this.updateChatBubbleMessage('Error recognizing speech. Please try again.');
        }
      };
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
    
    startListening() {
      if (!this.recognition) return;
      
      try {
        this.recognition.start();
      } catch (err) {
        console.error('Error starting speech recognition:', err);
        this.addMessage('Could not start speech recognition. Please try again.', 'assistant');
        this.updateChatBubbleMessage('Could not start speech recognition. Please try again.');
      }
    },
    
    stopListening() {
      if (!this.recognition) return;
      
      try {
        this.recognition.stop();
      } catch (err) {
        console.error('Error stopping speech recognition:', err);
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
    
    async processVoiceCommand(command) {
      // Add a loading message
      this.addMessage('Processing...', 'assistant');
      this.updateChatBubbleMessage('Processing...');
      this.setLoading(true);
      
      try {
        // Call your AI backend to process the command
        const response = await this.callAIBackend(command);
        
        // Remove the loading message
        this.messagesContainer.removeChild(this.messagesContainer.lastChild);
        
        // Add the AI response
        this.addMessage(response.message, 'assistant');
        
        // Handle any actions returned from the AI
        if (response.action === 'search') {
          window.location.href = `/search?q=${encodeURIComponent(response.query)}`;
        } else if (response.action === 'product') {
          window.location.href = `/products/${response.handle}`;
        } else if (response.action === 'collection') {
          window.location.href = `/collections/${response.handle}`;
        }
      } catch (error) {
        console.error('Error processing voice command:', error);
        
        // Remove the loading message
        this.messagesContainer.removeChild(this.messagesContainer.lastChild);
        
        // Add an error message
        this.addMessage('Sorry, I had trouble understanding that. Please try again.', 'assistant');
      } finally {
        this.setLoading(false);
      }
    },
    
    async callAIBackend(command) {
      // For demo purposes, we'll simulate a response
      // In a real implementation, this would call your AI backend API
      
      return new Promise((resolve) => {
        setTimeout(() => {
          // Simulate different responses based on the command
          if (command.toLowerCase().includes('products') || 
              command.toLowerCase().includes('find') || 
              command.toLowerCase().includes('search')) {
            
            resolve({
              message: 'Here are some products that match your search.',
              action: 'search',
              query: command.replace(/find|search|show me|products|product/gi, '').trim()
            });
          } else if (command.toLowerCase().includes('recommendation') || 
                     command.toLowerCase().includes('suggest')) {
            
            resolve({
              message: 'I recommend checking out our best sellers collection.',
              action: 'collection',
              handle: 'best-sellers'
            });
          } else {
            resolve({
              message: 'I can help you find products, check prices, or provide recommendations. What would you like to know?',
              action: 'none'
            });
          }
        }, 1000); // Simulate network delay
      });
      
      // Real implementation would look like:
      /*
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command,
          shopDomain: this.shopDomain
        })
      });
      
      if (!response.ok) {
        throw new Error('Error communicating with AI backend');
      }
      
      return await response.json();
      */
    },
    
    // Clean up resources when needed
    destroy() {
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
      }
      
      if (this.nameInterval) {
        clearInterval(this.nameInterval);
      }
      
      if (this.audioContext) {
        this.audioContext.close();
      }
    }
  };
  
  // Initialize the voice assistant
  VoiceAssistant.init();
  
  // Handle page unload to clean up resources
  window.addEventListener('beforeunload', () => {
    VoiceAssistant.destroy();
  });
});