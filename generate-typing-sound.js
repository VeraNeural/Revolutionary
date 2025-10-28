#!/usr/bin/env node
// Generate subtle typing sound as base64

const fs = require('fs');
const { exec } = require('child_process');

// Create a simple WAV file generator
function generateTypingSound() {
  // Audio parameters
  const sampleRate = 44100;
  const duration = 0.08; // 80ms
  const samples = Math.floor(sampleRate * duration);

  // Create audio data
  const audioData = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;

    // Exponential envelope (quick attack, fast decay)
    const envelope = Math.exp(-t / 0.04);

    // Soft noise
    const noise = (Math.random() - 0.5) * 2;

    // Add slight frequency characteristic (soft click at ~150Hz)
    const freq = 0.05 * Math.sin(2 * Math.PI * 150 * t);

    // Combine and apply envelope
    audioData[i] = (noise + freq) * envelope * 0.25;
  }

  // Convert to WAV
  const wav = audioBufferToWav(audioData, sampleRate);

  // Convert to base64
  const base64 = Buffer.from(wav).toString('base64');

  return base64;
}

function audioBufferToWav(audioBuffer, sampleRate) {
  const length = audioBuffer.length;
  const numberOfChannels = 1;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  const wav = Buffer.alloc(44 + length * bytesPerSample);
  const view = new DataView(wav.buffer);

  // Helper to write string
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // WAV header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * bytesPerSample, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, length * bytesPerSample, true);

  // Write audio samples
  const volume = 0.8;
  let index = 44;

  for (let i = 0; i < length; i++) {
    const sample = audioBuffer[i];
    const s = 32767; // Max 16-bit value
    const value = sample < 0 ? sample * s : sample * s;
    view.setInt16(index, value, true);
    index += 2;
  }

  return wav;
}

// Generate and output
try {
  const base64Audio = generateTypingSound();
  console.log(base64Audio);
} catch (error) {
  console.error('Error generating audio:', error);
  process.exit(1);
}
