#!/usr/bin/env python3
"""
Generate simple icon files for the ProxyForge extension
Creates minimal valid PNG files with solid color
"""

import struct
import zlib
import os

def create_simple_png(size):
    """Create a minimal valid PNG file with purple color"""
    # PNG header
    header = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk (Image Header)
    width = size
    height = size
    bit_depth = 8
    color_type = 2  # RGB
    compression = 0
    filter_method = 0
    interlace = 0
    
    ihdr_data = struct.pack('>IIBBBBB', width, height, bit_depth, color_type, 
                            compression, filter_method, interlace)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # Create image data with gradient effect
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # Filter type: None
        for x in range(width):
            # Create a simple gradient from purple to blue
            r = int(102 + (118 - 102) * y / height)
            g = int(126 - (126 - 75) * y / height)
            b = int(234 - (234 - 162) * y / height)
            raw_data += bytes([r, g, b])
    
    # Compress the image data
    compressed = zlib.compress(raw_data, 9)
    
    # IDAT chunk (Image Data)
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND chunk (Image End)
    iend_crc = zlib.crc32(b'IEND')
    iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    return header + ihdr + idat + iend

def main():
    # Ensure icons directory exists
    icons_dir = "/Users/zephr/tools/proxyforge/extension/icons"
    os.makedirs(icons_dir, exist_ok=True)
    
    # Icon sizes required by Chrome extension
    sizes = [16, 48, 128]
    
    for size in sizes:
        png_data = create_simple_png(size)
        filename = os.path.join(icons_dir, f"icon-{size}.png")
        with open(filename, 'wb') as f:
            f.write(png_data)
        print(f"Created {filename}")
    
    print("All icons generated successfully!")

if __name__ == "__main__":
    main()