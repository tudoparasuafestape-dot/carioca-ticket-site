"""Offline, fail-closed raster validator. Not an Apps Script service or sanitizer.

Source bytes never change. Treat results as trusted only when produced by the
server worker, not submitted by clients. Public delivery/editorial approval are
separate. CLI uses an isolated, memory/CPU/time-bounded worker (POSIX only).
"""
import hashlib
import io
import json
import multiprocessing
import struct
import warnings
import zlib

from PIL import Image, ImageFile

MAX_BYTES = 2_065_000
MAX_PIXELS = 8_000_000
MAX_SIDE = 8192
MIMES = {"image/png": "PNG", "image/jpeg": "JPEG"}


class InvalidImage(ValueError):
    pass


def _png_container(data):
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise InvalidImage("SIGNATURE")
    offset, ended, first = 8, False, True
    while offset < len(data):
        if offset + 12 > len(data):
            raise InvalidImage("TRUNCATED_PNG")
        size = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        end = offset + size + 12
        if size > MAX_BYTES or end > len(data):
            raise InvalidImage("TRUNCATED_PNG")
        if first and (kind != b"IHDR" or size != 13):
            raise InvalidImage("PNG_HEADER")
        first = False
        if kind in (b"acTL", b"fcTL", b"fdAT"):
            raise InvalidImage("ANIMATION")
        if zlib.crc32(data[offset + 4:end - 4]) & 0xffffffff != struct.unpack(">I", data[end - 4:end])[0]:
            raise InvalidImage("PNG_CRC")
        if kind == b"IEND":
            if size or end != len(data):
                raise InvalidImage("TRAILING_DATA")
            ended = True
            break
        offset = end
    if not ended:
        raise InvalidImage("TRUNCATED_PNG")


def _jpeg_container(data):
    if not data.startswith(b"\xff\xd8"):
        raise InvalidImage("JPEG_SIGNATURE")
    offset = 2
    while offset < len(data):
        if data[offset] != 255:
            raise InvalidImage("JPEG_MARKER")
        while offset < len(data) and data[offset] == 255:
            offset += 1
        if offset >= len(data):
            break
        marker = data[offset]; offset += 1
        if marker == 0xD9:
            if offset != len(data):
                raise InvalidImage("TRAILING_DATA")
            return
        if marker in (0x00, 0xD8) or 0xD0 <= marker <= 0xD7:
            raise InvalidImage("JPEG_MARKER")
        if marker == 0x01:
            continue
        if offset + 2 > len(data):
            break
        length = struct.unpack(">H", data[offset:offset + 2])[0]
        if length < 2 or offset + length > len(data):
            raise InvalidImage("TRUNCATED_JPEG")
        offset += length
        if marker == 0xDA:
            # Entropy scan: escaped FF and restart markers are data; all other
            # markers are parsed by the outer loop (supports progressive JPEG).
            while offset < len(data):
                if data[offset] != 255:
                    offset += 1
                    continue
                start = offset
                while offset < len(data) and data[offset] == 255:
                    offset += 1
                if offset >= len(data):
                    break
                if data[offset] == 0 or 0xD0 <= data[offset] <= 0xD7:
                    offset += 1
                    continue
                offset = start
                break
    raise InvalidImage("TRUNCATED_JPEG")


def validate_image(data, expected_mime):
    """Full decode; bounded in bytes/dimensions. Use validate_isolated at ingress."""
    if type(data) is not bytes or not 8 <= len(data) <= MAX_BYTES:
        raise InvalidImage("SIZE_LIMIT")
    if expected_mime not in MIMES:
        raise InvalidImage("MIME_NOT_ALLOWED")
    if expected_mime == "image/png":
        _png_container(data)
    else:
        _jpeg_container(data)
    # Defaults are made explicit inside the isolated process. Do not enable
    # LOAD_TRUNCATED_IMAGES to rescue malformed uploads.
    ImageFile.LOAD_TRUNCATED_IMAGES = False
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        try:
            with Image.open(io.BytesIO(data)) as im:
                if im.format != MIMES[expected_mime]:
                    raise InvalidImage("MIME_MISMATCH")
                width, height = im.size
                if not (1 <= width <= MAX_SIDE and 1 <= height <= MAX_SIDE) or width * height > MAX_PIXELS:
                    raise InvalidImage("PIXEL_LIMIT")
                if getattr(im, "is_animated", False) or getattr(im, "n_frames", 1) != 1:
                    raise InvalidImage("ANIMATION")
                im.verify()
            # verify checks structure; re-open and load forces every raster byte
            # to decode. Conversion additionally exercises the decoded pixels.
            with Image.open(io.BytesIO(data)) as im:
                im.load()
                rgb = im.convert("RGB")
                rgb.load()
                rgb.close()
        except InvalidImage:
            raise
        except Exception as exc:
            raise InvalidImage("DECODE_REJECTED") from exc
    return {"validation": "FULL_DECODE_PASSED", "mime": expected_mime,
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "width": width, "height": height, "frames": 1,
            "sanitized": False}


def _worker(pipe, data, mime):
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_CPU, (3, 3))
        pipe.send({"ok": True, "result": validate_image(data, mime)})
    except BaseException:
        # Never expose input bytes, paths or library internals to callers.
        pipe.send({"ok": False, "error": "DECODE_REJECTED"})
    finally:
        pipe.close()


def validate_isolated(data, mime, timeout=5):
    if type(data) is not bytes or len(data) > MAX_BYTES:
        raise InvalidImage("SIZE_LIMIT")
    ctx = multiprocessing.get_context("spawn")
    reader, writer = ctx.Pipe(duplex=False)
    proc = ctx.Process(target=_worker, args=(writer, data, mime))
    proc.start()
    writer.close()
    try:
        if not reader.poll(timeout):
            raise InvalidImage("DECODE_TIMEOUT")
        try:
            reply = reader.recv()
        except EOFError as exc:
            raise InvalidImage("DECODE_WORKER_FAILED") from exc
        if not reply.get("ok"):
            raise InvalidImage("DECODE_REJECTED")
        return reply["result"]
    finally:
        if proc.is_alive():
            proc.terminate()
        proc.join(1)
        if proc.is_alive():
            proc.kill()
            proc.join()
        reader.close()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    parser.add_argument("mime", choices=list(MIMES))
    args = parser.parse_args()
    try:
        with open(args.file, "rb") as source:
            data = source.read(MAX_BYTES + 1)
        print(json.dumps(validate_isolated(data, args.mime), sort_keys=True))
    except (OSError, InvalidImage):
        print(json.dumps({"error": "DECODE_REJECTED"}))
        raise SystemExit(1)
