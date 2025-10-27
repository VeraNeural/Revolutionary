#!/usr/bin/env python3
"""
Generate mobile home screen icons for VERA
Creates PNG images with purple gradient orb design
"""

import os
import sys
from PIL import Image, ImageDraw

# VERA's purple gradient colors
GRADIENT_START = (102, 126, 234)   # #667eea - Light purple
GRADIENT_END = (118, 75, 162)      # #764ba2 - Dark purple

def create_gradient_orb(size):
    """Create a circular gradient orb image"""
    # Create image with RGBA to support transparency
    image = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pixels = image.load()
    
    center_x = size / 2
    center_y = size / 2
    max_radius = size / 2
    
    # Draw gradient from center outward
    for x in range(size):
        for y in range(size):
            # Calculate distance from center
            dx = x - center_x
            dy = y - center_y
            distance = (dx * dx + dy * dy) ** 0.5
            
            # Calculate gradient ratio (0 at center, 1 at edges)
            if distance <= max_radius:
                ratio = distance / max_radius
                
                # Interpolate between start and end colors
                r = int(GRADIENT_START[0] * (1 - ratio) + GRADIENT_END[0] * ratio)
                g = int(GRADIENT_START[1] * (1 - ratio) + GRADIENT_END[1] * ratio)
                b = int(GRADIENT_START[2] * (1 - ratio) + GRADIENT_END[2] * ratio)
                
                # Add subtle shimmer effect
                shine_factor = 0.15 * (1 - ratio) if distance < max_radius * 0.3 else 0
                r = min(255, int(r + 255 * shine_factor))
                g = min(255, int(g + 255 * shine_factor))
                b = min(255, int(b + 255 * shine_factor))
                
                # Smooth alpha falloff at edges
                alpha = int(255 * (1 - (distance / max_radius) ** 2))
                pixels[x, y] = (r, g, b, alpha)
    
    return image

def generate_icons():
    """Generate all required icon sizes"""
    
    # Define icon configurations
    sizes = [
        ('apple-touch-icon.png', 180, 'Apple Touch Icon'),
        ('android-chrome-192x192.png', 192, 'Android Chrome 192x192'),
        ('android-chrome-512x512.png', 512, 'Android Chrome 512x512')
    ]
    
    # Get public directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.join(os.path.dirname(script_dir), 'public')
    
    # Create public directory if it doesn't exist
    os.makedirs(public_dir, exist_ok=True)
    print(f'✅ Public directory ready: {public_dir}\n')
    
    print('🎨 Generating VERA mobile home screen icons...\n')
    
    for filename, size, description in sizes:
        try:
            # Create gradient orb
            image = create_gradient_orb(size)
            
            # Save as PNG
            filepath = os.path.join(public_dir, filename)
            image.save(filepath, 'PNG')
            
            # Get file size
            file_size = os.path.getsize(filepath)
            
            print(f'✅ Created: {filename} ({size}x{size}px)')
            print(f'   Description: {description}')
            print(f'   Location: {filepath}')
            print(f'   Size: {file_size / 1024:.2f} KB\n')
        
        except Exception as e:
            print(f'❌ Error creating {filename}: {str(e)}\n')
            return False
    
    print('✨ Icon generation complete!')
    print('\nIcons created in public/ directory:')
    for filename, size, _ in sizes:
        print(f'  ✓ {filename}')
    
    return True

if __name__ == '__main__':
    success = generate_icons()
    sys.exit(0 if success else 1)
