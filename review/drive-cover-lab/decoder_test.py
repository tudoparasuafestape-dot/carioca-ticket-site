import hashlib
import io
import struct
import unittest
import zlib
from PIL import Image
from decoder import InvalidImage, validate_image, validate_isolated, MAX_BYTES


def raster(fmt="PNG", size=(32, 24)):
    out = io.BytesIO()
    Image.new("RGB", size, (12, 34, 56)).save(out, format=fmt)
    return out.getvalue()


class DecoderTests(unittest.TestCase):
    def test_png_and_jpeg_full_decode(self):
        for fmt, mime in [("PNG", "image/png"), ("JPEG", "image/jpeg")]:
            data = raster(fmt)
            r = validate_image(data, mime)
            self.assertEqual(r["sha256"], hashlib.sha256(data).hexdigest())
            self.assertEqual((r["width"], r["height"]), (32, 24))
            self.assertFalse(r["sanitized"])
            self.assertEqual(r["validation"], "FULL_DECODE_PASSED")

    def test_truncation_rejected(self):
        for fmt, mime in [("PNG", "image/png"), ("JPEG", "image/jpeg")]:
            data = raster(fmt)
            for missing in [1, 5, len(data)//2]:
                with self.assertRaises(InvalidImage):
                    validate_image(data[:-missing], mime)

    def test_mime_mismatch(self):
        with self.assertRaises(InvalidImage):
            validate_image(raster(), "image/jpeg")
        with self.assertRaises(InvalidImage):
            validate_image(raster(), "image/svg+xml")

    def test_corrupt_png_crc(self):
        data = bytearray(raster()); data[44] ^= 1
        with self.assertRaisesRegex(InvalidImage, "CRC"):
            validate_image(bytes(data), "image/png")

    def test_png_appended_bytes(self):
        with self.assertRaises(InvalidImage):
            validate_image(raster() + b"<script>bad</script>", "image/png")

    def test_pixel_bomb_before_decode(self):
        data = bytearray(raster())
        data[16:24] = struct.pack(">II", 8192, 8192)
        data[29:33] = struct.pack(">I", zlib.crc32(data[12:29]) & 0xffffffff)
        with self.assertRaisesRegex(InvalidImage, "PIXEL_LIMIT"):
            validate_image(bytes(data), "image/png")

    def test_animation_rejected(self):
        out = io.BytesIO()
        Image.new("RGB", (10,10), "red").save(out, format="PNG", save_all=True,
            append_images=[Image.new("RGB", (10,10), "blue")], duration=100, loop=0)
        with self.assertRaisesRegex(InvalidImage, "ANIMATION"):
            validate_image(out.getvalue(), "image/png")

    def test_concatenated_jpeg_rejected(self):
        with self.assertRaisesRegex(InvalidImage, "TRAILING_DATA"):
            validate_image(raster("JPEG") + raster("JPEG"), "image/jpeg")

    def test_progressive_jpeg(self):
        out = io.BytesIO()
        Image.new("RGB", (32, 24)).save(out, format="JPEG", progressive=True)
        self.assertEqual(validate_image(out.getvalue(), "image/jpeg")["width"], 32)

    def test_size_bound(self):
        with self.assertRaises(InvalidImage):
            validate_image(b"x" * (MAX_BYTES + 1), "image/png")

    def test_isolated_worker(self):
        self.assertEqual(validate_isolated(raster(), "image/png")["width"], 32)
        with self.assertRaises(InvalidImage):
            validate_isolated(b"malformed image", "image/png")


if __name__ == "__main__":
    unittest.main()
