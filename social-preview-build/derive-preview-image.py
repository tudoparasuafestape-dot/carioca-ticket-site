#!/usr/bin/env python3
"""Mechanical preview only: no AI, crop, drawing, metadata retention or source writes."""
import io, sys, warnings
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = 40_000_000
warnings.simplefilter('error', Image.DecompressionBombWarning)
data = sys.stdin.buffer.read(8_000_001)
if not 512 <= len(data) <= 8_000_000:
    raise ValueError('Invalid bounded image input')
with Image.open(io.BytesIO(data)) as source:
    if source.format not in ('PNG', 'JPEG') or getattr(source, 'n_frames', 1) != 1:
        raise ValueError('Only single-frame PNG/JPEG supported')
    source.load()
    image = ImageOps.exif_transpose(source)
    image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
        rgba = image.convert('RGBA')
        background = Image.new('RGB', rgba.size, 'white')
        background.paste(rgba, mask=rgba.getchannel('A'))
        image = background
    else:
        image = image.convert('RGB')
    out = io.BytesIO()
    image.save(out, 'JPEG', quality=90, subsampling=0, optimize=True, progressive=True)
    result = out.getvalue()
    if len(result) > 8_000_000:
        raise ValueError('Derivative exceeds output limit')
    sys.stdout.buffer.write(result)
