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
    
    // For audio recording
    mediaRecorder: null,
    audioChunks: [],
    
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
      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        
        // Try to detect the browser's preferred language first
        const browserLanguage = navigator.language || navigator.userLanguage || 'en-US';
        console.log('Browser language detected:', browserLanguage);
        
        // List of fallback languages to try if the browser's language isn't supported
        const fallbackLanguages = ['en-US', 'en-GB', 'en', 'fr-FR', 'de-DE', 'es-ES'];
        
        // Set the initial language
        this.recognition.lang = browserLanguage;
        
        // Counter to track language attempts
        let languageAttemptIndex = 0;
        
        this.recognition.onstart = () => {
          this.isListening = true;
          this.recordButton.classList.add('recording');
          this.recordButton.querySelector('span').textContent = 'Listening...';
          this.updateChatBubbleMessage('I\'m listening...');
        };
        
        // Handle language-not-supported error by trying fallback languages
        this.recognition.onerror = (event) => {
          console.error('Speech recognition error', event.error);
          
          if (event.error === 'language-not-supported') {
            // Try the next fallback language
            if (languageAttemptIndex < fallbackLanguages.length) {
              const nextLanguage = fallbackLanguages[languageAttemptIndex++];
              console.log(`Trying fallback language: ${nextLanguage}`);
              this.recognition.lang = nextLanguage;
              
              // Try again with the new language
              try {
                this.recognition.stop();
                setTimeout(() => this.recognition.start(), 100);
                return;
              } catch (e) {
                console.error('Error restarting speech recognition:', e);
              }
            } else {
              // We've tried all languages and none worked
              this.addMessage('Sorry, speech recognition is not supported in your browser. Please type your request instead.', 'assistant');
              this.updateChatBubbleMessage('Sorry, speech recognition is not supported in your browser.');
            }
          } else if (event.error === 'no-speech') {
            this.addMessage('I didn\'t hear anything. Please try again.', 'assistant');
            this.updateChatBubbleMessage('I didn\'t hear anything. Please try again.');
          } else {
            this.addMessage('Error recognizing speech. Please try again.', 'assistant');
            this.updateChatBubbleMessage('Error recognizing speech. Please try again.');
          }
        };
        
        this.recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          this.addMessage(transcript, 'user');
          this.processVoiceCommand(transcript);
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
      } catch (e) {
        console.error('Speech recognition initialization error:', e);
        this.addMessage('Your browser does not support voice recognition.', 'assistant');
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
        
        // Request microphone access with optimized constraints for voice
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000, // Optimal for speech recognition
            channelCount: 1, // Mono audio is sufficient for voice
          } 
        });
        
        // Set up WebSocket for real-time audio streaming if supported
        if (this.setupWebSocketConnection()) {
          // WebSocket audio streaming setup successful
          this.startWebSocketAudioStream(stream);
        }
        // Fall back to MediaRecorder if WebSocket not available
        else if (typeof MediaRecorder !== 'undefined') {
          console.log('WebSocket streaming not available, using MediaRecorder');
          this.startMediaRecorderStream(stream);
        }
        // Ultimate fallback to SpeechRecognition API
        else if (this.recognition) {
          console.log('Using SpeechRecognition API as fallback');
          this.recognition.start();
          // Set a timeout to automatically stop listening after 10 seconds
          this.recognitionTimeout = setTimeout(() => {
            if (this.isListening) {
              this.stopListening();
            }
          }, 10000);
        } 
        else {
          throw new Error('No audio input methods available');
        }
      } catch (err) {
        console.error('Error starting audio capture:', err);
        this.isListening = false;
        this.recordButton.classList.remove('recording');
        this.recordButton.querySelector('span').textContent = 'Tap to speak';
        this.addMessage('Could not access microphone. Please check your permissions.', 'assistant');
        this.setLoading(false);
      }
    },
    
    // Set up WebSocket connection for streaming audio
    setupWebSocketConnection() {
      try {
        console.log('Attempting to set up SSE connection');
        
        // Only create a new EventSource if we don't already have one or if it's closed
        if (!this.eventSource || this.eventSource.readyState === 2) { // 2 = CLOSED
          // For app proxy through Shopify
          const wsEndpoint = `/apps/voice/ws?shop=${encodeURIComponent(this.shopDomain)}`;
          console.log('Setting up EventSource at:', wsEndpoint);
          
          // Create EventSource with credentials
          this.eventSource = new EventSource(wsEndpoint);
          
          this.eventSource.onopen = () => {
            console.log('EventSource connected successfully');
          };
          
          this.eventSource.onmessage = (event) => {
            try {
              console.log('Raw SSE message received:', event.data);
              
              // Handle special case for heartbeats
              if (event.data.startsWith(':')) {
                console.log('Heartbeat received');
                return;
              }
              
              const data = JSON.parse(event.data);
              console.log('Server sent message:', data.type);
              
              if (data.type === 'result' && data.result) {
                console.log('Received result from server');
                // Handle result from server
                this.handleFinalResponse(data.result);
                // Automatically stop listening when we get a response
                this.stopListening();
              } else if (data.type === 'error') {
                console.error('Server error:', data.message);
                this.addMessage('Error: ' + (data.message || 'Unknown server error'), 'assistant');
                this.setLoading(false);
                this.stopListening();
              } else if (data.type === 'connected') {
                console.log('SSE connection established with server');
              } else if (data.type === 'disconnected') {
                console.log('SSE connection closed by server');
              } else if (data.type === 'reconnecting') {
                console.log('Server is reconnecting, attempt:', data.attempt);
              }
            } catch (e) {
              console.error('Error parsing server message:', e);
            }
          };
          
          this.eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            
            // Don't close on first error - allow automatic reconnection
            if (this.eventSource.readyState === 2) { // CLOSED
              console.log('EventSource connection closed due to error');
              // If we're still listening, let the user know there was a problem
              if (this.isListening) {
                this.addMessage('Connection to server lost. Please try again.', 'assistant');
                this.setLoading(false);
                this.stopListening();
              }
            }
          };
        }
        
        // Generate a unique request ID for this audio session
        this.currentRequestId = `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        console.log('Generated request ID:', this.currentRequestId);
        
        return true;
      } catch (e) {
        console.error('Error setting up WebSocket connection:', e);
        return false;
      }
    },
    
    // Stream audio via WebSockets in chunks
    startWebSocketAudioStream(stream) {
      // Set up audio context and processor
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000, // Match the sample rate we requested
      });
      
      const source = this.audioContext.createMediaStreamSource(stream);
      this.stream = stream;
      
      // Create processor node to access raw audio data
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!this.isListening) return;
        
        // Get audio data
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert float32 array to Int16 to reduce size
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = inputData[i] * 0x7FFF;
        }
        
        // Convert to Base64
        const base64Audio = this.arrayBufferToBase64(pcmData.buffer);
        
        // Send to server
        this.sendAudioChunk(base64Audio);
      };
      
      // Connect nodes
      source.connect(processor);
      processor.connect(this.audioContext.destination);
      
      this.audioProcessor = processor;
    },
    
    // Convert ArrayBuffer to Base64
    arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    },
    
    // Send audio chunk to server
    sendAudioChunk(base64Audio) {
      if (!base64Audio) return;
      
      try {
        // For app proxy routes through Shopify
        const audioEndpoint = '/apps/voice/audio';
        console.log('Sending audio chunk to:', audioEndpoint);
        
        fetch(audioEndpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            audio: base64Audio,
            shopDomain: this.shopDomain,
            requestId: this.currentRequestId
          }),
        }).catch(error => {
          console.error('Error sending audio chunk:', error);
        });
      } catch (error) {
        console.error('Error sending audio chunk:', error);
      }
    },
    
    // Fallback to MediaRecorder for browsers without good WebSocket support
    startMediaRecorderStream(stream) {
      // Choose appropriate mime type for better cross-browser compatibility
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
        
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      this.audioChunks = [];
      this.stream = stream;
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(this.audioChunks, { type: mimeType || 'audio/webm' });
          const reader = new FileReader();
          
          // Use a promise to handle FileReader async operation
          const base64Audio = await new Promise((resolve, reject) => {
            reader.onloadend = () => {
              // Split by comma and get the base64 part if it's a data URL
              const result = reader.result;
              if (typeof result === 'string' && result.includes(',')) {
                resolve(result.split(',')[1]);
              } else {
                resolve(result);
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(audioBlob);
          });
          
          console.log('Audio recorded successfully, sending to backend...');
          await this.processVoiceCommand(base64Audio);
        } catch (err) {
          console.error('Error processing recorded audio:', err);
          this.addMessage('Error processing your voice. Please try again.', 'assistant');
          this.setLoading(false);
        }
      };
      
      // Set a reasonable timeslice to get data as recording progresses
      this.mediaRecorder.start(100);
      
      // Start a timeout to automatically stop recording after 10 seconds
      this.recordingTimeout = setTimeout(() => {
        if (this.isListening) {
          this.stopListening();
        }
      }, 10000);
    },
    
    stopListening() {
      try {
        // Clear any timeouts
        if (this.recordingTimeout) {
          clearTimeout(this.recordingTimeout);
          this.recordingTimeout = null;
        }
        
        if (this.recognitionTimeout) {
          clearTimeout(this.recognitionTimeout);
          this.recognitionTimeout = null;
        }
        
        // Stop WebSocket audio streaming
        if (this.audioProcessor && this.audioContext) {
          try {
            this.audioProcessor.disconnect();
            this.audioContext.close().catch(e => console.warn('Error closing AudioContext:', e));
            this.audioProcessor = null;
          } catch (e) {
            console.warn('Error stopping audio processor:', e);
          }
        }
        
        // Stop MediaRecorder if active
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          console.log('Stopping MediaRecorder');
          try {
            this.mediaRecorder.stop();
          } catch (e) {
            console.warn('Error stopping MediaRecorder:', e);
          }
        }
        
        // Stop SpeechRecognition if active
        if (this.recognition) {
          console.log('Stopping SpeechRecognition');
          try {
            this.recognition.stop();
          } catch (e) {
            console.warn('Error stopping SpeechRecognition:', e);
          }
        }
        
        // Clean up media stream tracks
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
          this.stream = null;
        }
        
        // Update UI state
        this.isListening = false;
        this.recordButton.classList.remove('recording');
        this.recordButton.querySelector('span').textContent = 'Tap to speak';
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
    
    // Initialize API endpoints through Shopify App Proxy
    async initApiEndpoints() {
      // Using Shopify App Proxy format: /{prefix}/{subpath}
      this.apiEndpoint = '/apps/voice';
      console.log('Using App Proxy endpoint:', this.apiEndpoint);
      
      // Check for browser capabilities
      this.hasMediaRecorderSupport = typeof MediaRecorder !== 'undefined';
      this.hasAudioContextSupport = typeof (window.AudioContext || window.webkitAudioContext) !== 'undefined';
      this.hasEventSourceSupport = typeof EventSource !== 'undefined';
      
      console.log('Browser capabilities:');
      console.log('- MediaRecorder support:', this.hasMediaRecorderSupport ? 'Yes' : 'No');
      console.log('- AudioContext support:', this.hasAudioContextSupport ? 'Yes' : 'No');
      console.log('- EventSource support:', this.hasEventSourceSupport ? 'Yes' : 'No');
      
      // Detect mobile devices
      this.isMobile = this.detectMobileDevice();
      console.log('Mobile device:', this.isMobile ? 'Yes' : 'No');
      
      return Promise.resolve({
        apiEndpoint: this.apiEndpoint
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
    
    // Store pending requests by ID
    pendingRequests: {},
    
    async processVoiceCommand(audioDataOrTranscript) {
      // Add a loading message
      this.addMessage('Processing...', 'assistant');
      this.updateChatBubbleMessage('Processing...');
      this.setLoading(true);
      
      try {
        // Make sure we've initialized our API endpoints
        if (!this.apiEndpoint) {
          await this.initApiEndpoints();
        }
        
        // Determine if we're processing audio or text
        const isAudioData = typeof audioDataOrTranscript === 'string' && 
          (audioDataOrTranscript.startsWith('data:audio') || 
           // Check if it's a base64 string (likely audio data)
           /^[A-Za-z0-9+/=]+$/.test(audioDataOrTranscript));
        
        if (isAudioData) {
          console.log('Processing as audio data');
          // Send audio directly to app proxy endpoint
          try {
            await this.processAudioDirectly(audioDataOrTranscript);
          } catch (error) {
            console.warn('App proxy processing failed:', error);
            this.addMessage('Sorry, I had trouble processing your request. Please try again.', 'assistant');
            this.setLoading(false);
          }
        } else {
          // It's a text transcript
          console.log('Processing as text transcript:', audioDataOrTranscript);
          
          // Show the user's message
          if (this.messagesContainer.lastChild.classList.contains('assistant')) {
            this.messagesContainer.removeChild(this.messagesContainer.lastChild);
          }
          
          // Send text to the API directly
          try {
            const response = await fetch(this.apiEndpoint, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                command: audioDataOrTranscript,
                shopDomain: this.shopDomain,
                audio: '' // Empty audio for text-based requests
              }),
            });
            
            if (!response.ok) {
              throw new Error(`API error: ${response.status}`);
            }
            
            const result = await response.json();
            this.handleFinalResponse(result);
          } catch (error) {
            console.warn('Text processing failed:', error);
            this.addMessage('Sorry, I had trouble processing your request. Please try again.', 'assistant');
            this.setLoading(false);
          }
        }
      } catch (error) {
        console.error('Error processing command:', error);
        
        // Remove the loading message
        if (this.messagesContainer.lastChild && this.messagesContainer.lastChild.classList.contains('assistant')) {
          this.messagesContainer.removeChild(this.messagesContainer.lastChild);
        }
        
        // Add an error message
        this.addMessage('Sorry, I had trouble understanding that. Please try again.', 'assistant');
        this.setLoading(false);
      }
    },
    
    // Send audio directly to App Proxy endpoint
    async processAudioDirectly(audioData) {
      console.log('Processing audio through App Proxy:', this.apiEndpoint);
      return new Promise(async (resolve, reject) => {
        try {
          // Add logging to debug request
          console.log(`Sending request to: ${this.apiEndpoint}`);
          console.log(`Request includes audio data: ${!!audioData}`);
          console.log(`Request includes shop domain: ${!!this.shopDomain}`);
          
          // Send audio to our app proxy endpoint
          const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              audio: audioData,
              shopDomain: this.shopDomain
            }),
          });
          
          console.log(`Response status: ${response.status}`);
          
          if (!response.ok) {
            let errorMessage = 'Error processing audio';
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorMessage;
              console.error('Error details:', errorData);
            } catch (e) {
              // If response isn't JSON, use status text
              errorMessage = `Error (${response.status}): ${response.statusText}`;
              console.error('Error parsing error response:', e);
            }
            reject(new Error(errorMessage));
            return;
          }
          
          // Get the result directly from the response
          const result = await response.json();
          console.log('Successfully got result from API');
          this.handleFinalResponse(result);
          resolve();
        } catch (error) {
          console.error('Error processing audio:', error);
          reject(error);
        }
      });
    },
    
    // Legacy method - kept for fallback compatibility
    async callAIBackend(audioData, apiEndpoint) {
      // Use app proxy endpoint if none provided
      const endpoint = apiEndpoint || this.apiEndpoint;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          command: "DUMMY", // The command is extracted from audio on the backend
          shopDomain: this.shopDomain,
          audio: audioData
        }),
      });

      if (!response.ok && response.status !== 202) {
        throw new Error('Error communicating with AI backend');
      }

      return await response.json();
    },
    
    async pollForResult(predictionId, apiEndpoint = '/api/voice-assistant') {
      let attempts = 0;
      const maxAttempts = 30; // Maximum 30 seconds of polling
      
      try {
        do {
          if (attempts >= maxAttempts) {
            this.addMessage('Sorry, the request is taking too long. Please try again.', 'assistant');
            this.setLoading(false);
            return;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
          
          // We poll through our API endpoint
          const pollEndpoint = apiEndpoint.endsWith('/poll') 
            ? apiEndpoint 
            : `${apiEndpoint}/poll`;
            
          const response = await fetch(`${pollEndpoint}?id=${predictionId}`, {
            method: 'GET',
            headers: {
              "Content-Type": "application/json"
            },
          });

          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }

          const data = await response.json();
          
          if (data.status === "succeeded") {
            this.handleFinalResponse(JSON.parse(data.output));
            return;
          } else if (data.status === "failed") {
            // Remove the loading message
            if (this.messagesContainer.lastChild) {
              this.messagesContainer.removeChild(this.messagesContainer.lastChild);
            }
            this.addMessage('Sorry, there was an error processing your request.', 'assistant');
            this.setLoading(false);
            return;
          }
          // Continue polling for all other statuses (processing, starting, etc.)
        } while (true);
      } catch (error) {
        console.error('Error polling for result:', error);
        // Remove the loading message
        if (this.messagesContainer.lastChild) {
          this.messagesContainer.removeChild(this.messagesContainer.lastChild);
        }
        this.addMessage('Sorry, there was a problem communicating with the assistant.', 'assistant');
        this.setLoading(false);
      }
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
      
      // Close EventSource if open
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      
      // Clear any active timeouts
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
      }
      
      if (this.recognitionTimeout) {
        clearTimeout(this.recognitionTimeout);
      }
      
      // Clean up audio resources
      if (this.audioContext) {
        try {
          this.audioContext.close();
        } catch (e) {
          console.warn('Error closing AudioContext:', e);
        }
      }
      
      if (this.audioProcessor) {
        try {
          this.audioProcessor.disconnect();
        } catch (e) {
          console.warn('Error disconnecting audio processor:', e);
        }
      }
      
      // Clean up any media tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
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