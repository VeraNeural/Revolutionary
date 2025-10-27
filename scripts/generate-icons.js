#!/usr/bin/env node
/**
 * Generate mobile home screen icons for VERA
 * Creates PNG images with purple gradient orb design
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Icon sizes to generate
const sizes = [
  { name: 'apple-touch-icon.png', size: 180, desc: 'Apple Touch Icon' },
  { name: 'android-chrome-192x192.png', size: 192, desc: 'Android Chrome 192x192' },
  { name: 'android-chrome-512x512.png', size: 512, desc: 'Android Chrome 512x512' }
];

// VERA's purple gradient colors
const gradientStart = '#667eea';  // Light purple
const gradientEnd = '#764ba2';    // Dark purple

function createGradientOrb(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Create circular gradient from light to dark purple
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,              // Inner circle center
    size / 2, size / 2, size / 2        // Outer circle center and radius
  );

  gradient.addColorStop(0, gradientStart);   // Light purple at center
  gradient.addColorStop(1, gradientEnd);     // Dark purple at edges

  // Fill the entire canvas with the gradient
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Add subtle shimmer/shine effect
  const shineGradient = ctx.createRadialGradient(
    size * 0.3, size * 0.3, 0,
    size / 2, size / 2, size / 2
  );
  shineGradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  shineGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  shineGradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');

  ctx.fillStyle = shineGradient;
  ctx.fillRect(0, 0, size, size);

  return canvas;
}

async function generateIcons() {
  const publicDir = path.join(__dirname, '..', 'public');

  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    console.log(`✅ Created public directory: ${publicDir}`);
  }

  console.log('\n🎨 Generating VERA mobile home screen icons...\n');

  for (const iconConfig of sizes) {
    try {
      const canvas = createGradientOrb(iconConfig.size);
      const buffer = canvas.toBuffer('image/png');
      const filePath = path.join(publicDir, iconConfig.name);

      fs.writeFileSync(filePath, buffer);
      console.log(`✅ Created: ${iconConfig.name} (${iconConfig.size}x${iconConfig.size}px)`);
      console.log(`   Location: ${filePath}`);
      console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB\n`);
    } catch (error) {
      console.error(`❌ Error creating ${iconConfig.name}:`, error.message);
    }
  }

  console.log('✨ Icon generation complete!');
  console.log('\nIcons created in public/ directory:');
  sizes.forEach(icon => {
    console.log(`  - ${icon.name}`);
  });
}

// Run generation
generateIcons().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
