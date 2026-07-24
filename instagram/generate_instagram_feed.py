#!/usr/bin/env python3
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

def make_post(screenshot_path, output_path, title, subtitle):
    # 1. Create a 1080x1080 canvas
    canvas_size = (1080, 1080)
    canvas = Image.new("RGBA", canvas_size, (255, 255, 255, 255))
    
    # 2. Draw gradient blobs
    blobs = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    draw_blobs = ImageDraw.Draw(blobs)
    # Blue blob (bottom-left)
    draw_blobs.ellipse([(-200, 600, 450, 1250)], fill=(37, 99, 235, 30))
    # Purple blob (top-right)
    draw_blobs.ellipse([(650, -250, 1300, 400)], fill=(147, 51, 234, 30))
    # Blur the blobs to make them soft gradients
    blobs = blobs.filter(ImageFilter.GaussianBlur(130))
    canvas.alpha_composite(blobs)
    
    # 3. Load & Process Screenshot
    if not os.path.exists(screenshot_path):
        print(f"Error: Screenshot file not found at: {screenshot_path}")
        return False
        
    img = Image.open(screenshot_path).convert("RGBA")
    
    # Resize screenshot to fit nicely (max width 860, max height 540)
    max_w, max_h = 880, 560
    img.thumbnail((max_w, max_h), Image.Resampling.LANCZOS)
    w, h = img.size
    
    # Create rounded corners mask
    radius = 24
    mask = Image.new("L", (w, h), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.rounded_rectangle([0, 0, w, h], radius=radius, fill=255)
    
    # Apply rounded corners to screenshot
    rounded_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rounded_img.paste(img, (0, 0), mask=mask)
    
    # Draw dark border/glass outline around the screenshot
    border_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(border_img)
    draw_border.rounded_rectangle([0, 0, w-1, h-1], radius=radius, outline=(30, 41, 59, 35), width=2)
    rounded_img.alpha_composite(border_img)
    
    # Create shadow
    shadow_offset = (0, 24)
    shadow_blur = 35
    shadow = Image.new("RGBA", (w + shadow_blur * 2, h + shadow_blur * 2), (0, 0, 0, 0))
    draw_shadow = ImageDraw.Draw(shadow)
    # Draw shadow rectangle
    draw_shadow.rounded_rectangle([shadow_blur, shadow_blur, shadow_blur + w, shadow_blur + h], radius=radius, fill=(0, 0, 0, 30))
    shadow = shadow.filter(ImageFilter.GaussianBlur(shadow_blur))
    
    # Position shadow and image
    x = (canvas_size[0] - w) // 2
    # Place screenshot in the lower-middle part
    y = 380
    
    # Paste shadow onto canvas
    canvas.paste(shadow, (x - shadow_blur + shadow_offset[0], y - shadow_blur + shadow_offset[1]), mask=shadow.split()[3])
    # Paste image onto canvas
    canvas.paste(rounded_img, (x, y), mask=rounded_img.split()[3])
    
    # 4. Draw Typography
    draw_text = ImageDraw.Draw(canvas)
    
    # Fonts loading (macOS Helvetica fallback)
    font_path_bold = "/System/Library/Fonts/Helvetica.ttc"
    font_path_regular = "/System/Library/Fonts/Helvetica.ttc"
    
    try:
        # Index 1 is typically Bold, 0 is Regular in macOS ttc collections
        title_font = ImageFont.truetype(font_path_bold, 48, index=1)
        sub_font = ImageFont.truetype(font_path_regular, 26, index=0)
    except Exception as e:
        print(f"Note: Could not load Helvetica.ttc, falling back to default. Error: {e}")
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()
        
    # Draw Title (centered)
    title_w = draw_text.textlength(title, font=title_font)
    title_x = (canvas_size[0] - title_w) // 2
    draw_text.text((title_x, 150), title, font=title_font, fill=(15, 23, 42, 255))
    
    # Draw Subtitle (centered)
    sub_w = draw_text.textlength(subtitle, font=sub_font)
    sub_x = (canvas_size[0] - sub_w) // 2
    draw_text.text((sub_x, 220), subtitle, font=sub_font, fill=(100, 116, 139, 255))
    
    # 5. Save Output
    canvas.save(output_path, "PNG")
    print(f"Success! Generated feed post saved to: {output_path}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage:")
        print("  python3 generate_instagram_feed.py <screenshot_path> <output_path> <title> <subtitle>")
        print("\nExample:")
        print("  python3 generate_instagram_feed.py dashboard.png post_dashboard.png \"Controla tu Taller\" \"Métricas y estadísticas en tiempo real\"")
        sys.exit(1)
        
    screenshot = sys.argv[1]
    output = sys.argv[2]
    title_txt = sys.argv[3]
    subtitle_txt = sys.argv[4]
    
    make_post(screenshot, output, title_txt, subtitle_txt)
