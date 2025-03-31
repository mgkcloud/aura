/**
 * Voice Assistant Visualizer
 * 
 * This module handles the audio visualization components of the voice assistant,
 * creating an interactive and responsive visual representation of audio data.
 */

export class VoiceAssistantVisualizer {
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