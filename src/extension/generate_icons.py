#!/usr/bin/env python3
"""
Generate icon files for the ProxyForge extension
Creates simple colored square icons with "PF" text
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size):
    """Create a simple icon with gradient background and PF text"""
    # Create a new image with a gradient background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Create a simple gradient effect (purple to blue)
    for i in range(size):
        # Gradient from purple (102, 126, 234) to darker purple (118, 75, 162)
        r = int(102 + (118 - 102) * i / size)
        g = int(126 - (126 - 75) * i / size)
        b = int(234 - (234 - 162) * i / size)
        draw.rectangle([0, i, size, i+1], fill=(r, g, b, 255))
    
    # Draw rounded corners
    corner_radius = size // 5
    draw.pieslice([0, 0, corner_radius*2, corner_radius*2], 180, 270, fill=(0, 0, 0, 0))
    draw.pieslice([size-corner_radius*2, 0, size, corner_radius*2], 270, 360, fill=(0, 0, 0, 0))
    draw.pieslice([0, size-corner_radius*2, corner_radius*2, size], 90, 180, fill=(0, 0, 0, 0))
    draw.pieslice([size-corner_radius*2, size-corner_radius*2, size, size], 0, 90, fill=(0, 0, 0, 0))
    
    # Add "PF" text
    try:
        # Try to use a system font
        font_size = int(size * 0.4)
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        # Fall back to default font
        font = ImageFont.load_default()
    
    text = "PF"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    text_x = (size - text_width) // 2
    text_y = (size - text_height) // 2
    
    # Draw text with a slight shadow for depth
    draw.text((text_x+1, text_y+1), text, fill=(0, 0, 0, 128), font=font)
    draw.text((text_x, text_y), text, fill=(255, 255, 255, 255), font=font)
    
    return img

def main():
    # Ensure icons directory exists
    icons_dir = "/Users/zephr/tools/proxyforge/extension/icons"
    os.makedirs(icons_dir, exist_ok=True)
    
    # Icon sizes required by Chrome extension
    sizes = [16, 48, 128]
    
    for size in sizes:
        img = create_icon(size)
        filename = os.path.join(icons_dir, f"icon-{size}.png")
        img.save(filename, "PNG")
        print(f"Created {filename}")
    
    print("All icons generated successfully!")

if __name__ == "__main__":
    try:
        main()
    except ImportError:
        print("Pillow library not installed. Creating simple placeholder icons instead...")
        # Create simple placeholder icons without Pillow
        import struct
        import zlib
        
        def create_simple_png(size):
            """Create a minimal valid PNG file"""
            # PNG header
            header = b'\x89PNG\r\n\x1a\n'
            
            # IHDR chunk
            ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
            ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
            ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
            
            # Create simple image data (solid purple)
            raw_data = b''
            for y in range(size):
                raw_data += b'\x00'  # Filter type
                for x in range(size):
                    raw_data += b'\x66\x7e\xea'  # RGB: purple color
            
            compressed = zlib.compress(raw_data)
            idat_crc = zlib.crc32(b'IDAT' + compressed)
            idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
            
            # IEND chunk
            iend_crc = zlib.crc32(b'IEND')
            iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
            
            return header + ihdr + idat + iend
        
        icons_dir = "/Users/zephr/tools/proxyforge/extension/icons"
        os.makedirs(icons_dir, exist_ok=True)
        
        for size in [16, 48, 128]:
            filename = os.path.join(icons_dir, f"icon-{size}.png")
            with open(filename, 'wb') as f:
                f.write(create_simple_png(size))
            print(f"Created placeholder {filename}")