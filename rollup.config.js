import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'extensions/voice-assistant/assets/voice-assistant.js',
  output: {
    dir: 'extensions/voice-assistant/assets/dist',
    format: 'es',
    entryFileNames: 'voice-assistant-bundle.js',
    chunkFileNames: '[name]-[hash].js',
    sourcemap: false
  },
  plugins: [
    commonjs(),
    resolve({
      browser: true,
      preferBuiltins: false
    })
  ],
  // Treat livekit-client as external
  external: ['livekit-client']
}; 