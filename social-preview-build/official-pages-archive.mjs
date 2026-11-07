// Isolated candidate: exact Linux packaging command from upload-pages-artifact
// 56afc609e74202658d3ffba0e8f6dda462b719fa. No network, upload or deployment.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const FILE_LIMIT = 64 * 1024 * 1024;
const CONTENT_LIMIT = 256 * 1024 * 1024;
export const ARCHIVE_LIMIT = 300 * 1024 * 1024;
const TAR = '/usr/bin/tar';
const CHILD_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
const deny = message => { throw Error('CT_TITLE_ARCHIVE_DENIED: ' + message); };
const check = (ok, message) => { if (!ok) deny(message); };
const digest = b => crypto.createHash('sha256').update(b).digest('hex');
const zero = b => b.every(x => x === 0);
function logicalPath(relative) {
  check(typeof relative === 'string' && relative.length > 0 && relative.length <= 255 &&
    /^[A-Za-z0-9._/-]+$/.test(relative) && !relative.startsWith('/') &&
    relative.split('/').every(x => x && x !== '.' && x !== '..'), 'unsafe logical path');
  check(!relative.split('/').some(x => ['.git', '.github', 'node_modules', 'social-preview-build'].includes(x)), 'excluded path');
  // Fail closed before invoking GNU: the current 546 files need no extensions.
  check(Buffer.byteLength('./' + relative) <= 100, 'GNU longname/PAX extensions unsupported');
  return relative;
}
function expectedTree(files) {
  check(files instanceof Map && files.size <= 10000, 'file map missing/oversized');
  const directories = new Set(['']); let total = 0;
  for (const [relative, body] of files) {
    logicalPath(relative);
    check(Buffer.isBuffer(body) && body.length <= FILE_LIMIT && (total += body.length) <= CONTENT_LIMIT, 'file/content size limit');
    const parts = relative.split('/'); parts.pop();
    while (parts.length) { directories.add(parts.join('/')); parts.pop(); }
  }
  check(directories.size <= 20000, 'directory limit');
  for (const directory of directories) check(!files.has(directory), 'file/directory collision');
  return directories;
}
function stringField(header, start, length, label) {
  const raw = header.subarray(start, start + length), end = raw.indexOf(0);
  if (end !== -1) check(zero(raw.subarray(end)), label + ' bytes after NUL');
  const text = raw.subarray(0, end === -1 ? raw.length : end).toString('ascii');
  check(raw.subarray(0, end === -1 ? raw.length : end).every(b => b >= 32 && b < 127), label + ' non-ASCII/control');
  return text;
}
function octal(header, start, length, label) {
  const raw = header.subarray(start, start + length);
  check(raw[length - 1] === 0 && raw.subarray(0, -1).every(b => b >= 0x30 && b <= 0x37), label + ' noncanonical octal');
  const n = Number.parseInt(raw.subarray(0, -1).toString('ascii'), 8);
  check(Number.isSafeInteger(n) && n >= 0, label + ' overflow'); return n;
}
export function inspectArchive(archive, expectedFiles) {
  const expectedDirs = expectedTree(expectedFiles);
  const nowSeconds = Date.now() / 1000, identity = os.userInfo();
  check(process.getuid() === process.geteuid() && process.getgid() === process.getegid(), 'unexpected effective runner identity');
  const expectedGroup = execFileSync('/usr/bin/id', ['-gn'], { encoding: 'utf8', env: CHILD_ENV, timeout: 5000, maxBuffer: 1024 }).trim();
  check(/^[A-Za-z0-9_.-]+$/.test(expectedGroup), 'runner group identity unavailable');
  check(Buffer.isBuffer(archive) && archive.length >= 10240 && archive.length <= ARCHIVE_LIMIT &&
    archive.length % 10240 === 0, 'archive size/block framing');
  const seen = new Set(), files = new Map(), dirs = new Set(), members = [];
  let offset = 0, eof = false;
  while (offset < archive.length) {
    check(members.length < 30000 && offset + 512 <= archive.length, 'header count/truncation');
    const header = archive.subarray(offset, offset + 512);
    if (zero(header)) {
      const trailing = archive.subarray(offset);
      const expectedPadding = Math.ceil((offset + 1024) / 10240) * 10240 - offset;
      check(trailing.length === expectedPadding && zero(trailing), 'EOF missing/extra data');
      eof = true; break;
    }
    check(header.subarray(257, 265).equals(Buffer.from('ustar  \0', 'ascii')), 'unsupported GNU format');
    check(zero(header.subarray(157, 257)), 'link target denied');
    check(zero(header.subarray(329)), 'device/sparse/extended header denied');
    check(header.subarray(148, 154).every(b => b >= 0x30 && b <= 0x37) && header[154] === 0 && header[155] === 32, 'checksum syntax');
    const sum = [...header].reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0);
    check(Number.parseInt(header.subarray(148, 154).toString('ascii'), 8) === sum, 'header checksum');
    const name = stringField(header, 0, 100, 'name'), type = String.fromCharCode(header[156]);
    check(type === '0' || type === '5', 'links/PAX/longname/special member denied');
    check(name.startsWith('./'), 'member must start ./');
    const mode = octal(header, 100, 8, 'mode'), uid = octal(header, 108, 8, 'uid');
    const gid = octal(header, 116, 8, 'gid'), size = octal(header, 124, 12, 'size');
    const mtime = octal(header, 136, 12, 'mtime');
    const uname = stringField(header, 265, 32, 'uname'), gname = stringField(header, 297, 32, 'gname');
    check(uid === process.getuid() && gid === process.getgid() && uname === identity.username,
      'snapshot owner differs from current runner');
    check(gname === expectedGroup, 'snapshot group differs from current runner');
    check(mtime >= Math.floor(nowSeconds) - 300 && mtime <= Math.ceil(nowSeconds) + 1, 'snapshot mtime outside bounded window');
    check(size <= FILE_LIMIT, 'member size limit');
    let relative;
    if (type === '5') {
      check(name.endsWith('/') && size === 0 && mode === 0o755, 'directory size/mode/name');
      relative = name === './' ? '' : logicalPath(name.slice(2, -1));
      check(expectedDirs.has(relative), 'unexpected directory');
    } else {
      relative = logicalPath(name.slice(2));
      check(mode === 0o644 && expectedFiles.has(relative), 'unexpected file/mode');
    }
    check(!seen.has(relative), 'duplicate normalized path');
    check(members.length !== 0 || name === './' && type === '5', 'root directory must be first');
    if (relative) {
      const parent = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '';
      check(dirs.has(parent), 'ancestor missing/out of order');
    }
    seen.add(relative);
    const dataStart = offset + 512, padded = Math.ceil(size / 512) * 512;
    check(dataStart + padded <= archive.length, 'payload truncation');
    const body = archive.subarray(dataStart, dataStart + size);
    check(zero(archive.subarray(dataStart + size, dataStart + padded)), 'nonzero member padding');
    if (type === '0') {
      check(body.equals(expectedFiles.get(relative)), 'file bytes differ: ' + relative);
      files.set(relative, digest(body));
    } else dirs.add(relative);
    members.push({ name, relative, type, mode, uid, gid, mtime, uname, gname, size, offset });
    offset = dataStart + padded;
  }
  check(eof && files.size === expectedFiles.size && dirs.size === expectedDirs.size, 'incomplete inventory/EOF');
  return { archiveSha256: digest(archive), files: Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b))),
    members, trailingZeroBytes: archive.length - offset };
}
function readRegularFile(file, { minBytes, maxBytes, requiredMode }) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = fs.fstatSync(fd);
    check(before.isFile() && before.nlink === 1 && before.size >= minBytes && before.size <= maxBytes, 'regular file type/size/links');
    check(requiredMode === undefined || (before.mode & 0o7777) === requiredMode, 'external file mode');
    const bytes = Buffer.alloc(before.size); let n = 0;
    while (n < bytes.length) {
      const count = fs.readSync(fd, bytes, n, bytes.length - n, n); check(count > 0, 'archive truncated during read'); n += count;
    }
    const after = fs.fstatSync(fd);
    check(before.ino === after.ino && before.dev === after.dev && before.size === after.size &&
      before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs && after.nlink === 1, 'archive changed during read');
    return bytes;
  } finally { fs.closeSync(fd); }
}
export const readArchive = (file, options = {}) => readRegularFile(file, { minBytes: 10240, maxBytes: ARCHIVE_LIMIT, ...options });
export const readSeal = file => readRegularFile(file, { minBytes: 1, maxBytes: 2 * 1024 * 1024, requiredMode: 0o400 });
export function packVerifiedFiles(files) {
  const directories = expectedTree(files);
  check(process.platform === 'linux' && fs.realpathSync(TAR) === TAR, 'known Linux GNU tar required');
  const version = execFileSync(TAR, ['--version'], { encoding: 'utf8', env: CHILD_ENV, timeout: 5000 });
  check(version.startsWith('tar (GNU tar) '), 'GNU tar identity');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-official-pages-'));
  fs.chmodSync(temp, 0o700);
  try {
    const input = path.join(temp, 'input'), output = path.join(temp, 'artifact.tar');
    fs.mkdirSync(input, { mode: 0o755 }); fs.chmodSync(input, 0o755);
    for (const relative of [...directories].filter(Boolean).sort((a, b) => a.length - b.length || a.localeCompare(b))) {
      const dir = path.join(input, relative); fs.mkdirSync(dir, { mode: 0o755 }); fs.chmodSync(dir, 0o755);
    }
    for (const [relative, bytes] of files) {
      const fd = fs.openSync(path.join(input, relative), 'wx', 0o644);
      try { fs.writeFileSync(fd, bytes); fs.fchmodSync(fd, 0o644); } finally { fs.closeSync(fd); }
    }
    // Exact official Linux arguments. No shell and no inherited TAR_OPTIONS,
    // LD_PRELOAD, owner/time/format/sort overrides. Snapshot metadata is natural.
    execFileSync(TAR, ['--dereference', '--hard-dereference', '--directory', input,
      '-cvf', output, '--exclude=.git', '--exclude=.github', '.'],
    { env: CHILD_ENV, timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
    const archive = readArchive(output);
    inspectArchive(archive, files); // Trust the resulting bytes, not the directory.
    return archive;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
