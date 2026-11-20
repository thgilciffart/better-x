// Lazy font packs: fetch, verify, register.
//
// The WebAssembly module embeds only `core` (Chirp + Arial). Every other face
// lives in a pack built by `tools/ship/build-font-packs.mjs`:
//
//   emoji, cjk, hangul, math, latin, arabic, hebrew
//
// `packs.json` is the manifest: each pack has a SHA-256 for the whole blob and
// for every file inside it. The loader checks the blob before registering any
// file, so a truncated download or a corrupted CDN object fails loudly instead
// of painting wrong glyphs.
//
// This module is shared by Node (`src/node.js`) and the browser (`web/js`), so
// it imports nothing and takes the hash/read functions from its caller. Node
// passes synchronous versions; the browser passes `sha256Hex` and `fetch`.

/** Hex SHA-256, using Web Crypto (browsers and Node 20+). */
export async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("xeet: Web Crypto is not available; cannot verify the font pack checksum");
  }
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes));
  return toHex(digest);
}

/** Hex SHA-256 without Web Crypto, for a synchronous Node loader. */
export function toHex(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/**
 * @param {object} options
 * @param {{ version: number, packs: Record<string, { bytes: number, sha256: string, files: { file: string, offset: number, length: number, sha256: string }[] }> }} options.manifest
 * @param {(name: string) => Uint8Array | Promise<Uint8Array>} options.read
 * @param {(bytes: Uint8Array) => string | Promise<string>} options.hash
 * @param {(file: string, bytes: Uint8Array) => void} options.register
 * @param {(requestJson: string) => string} options.missingPacks
 */
export function createFontPacks({ manifest, read, hash, register, missingPacks }) {
  if (!manifest || manifest.version !== 1 || !manifest.packs || typeof manifest.packs !== "object") {
    throw new Error("xeet: packs.json has an unknown version or no packs");
  }
  const packs = manifest.packs;
  for (const [name, pack] of Object.entries(packs)) {
    if (!pack || !Array.isArray(pack.files) || pack.files.length === 0) {
      throw new Error(`xeet: font pack \`${name}\` has no files in packs.json`);
    }
  }
  const done = new Set();
  const pending = new Map();

  const bytesOf = (value) => (value instanceof Uint8Array ? value : new Uint8Array(value));

  function apply(name, raw) {
    const pack = packs[name];
    const bytes = bytesOf(raw);
    if (pack.bytes != null && bytes.length !== pack.bytes) {
      throw new Error(
        `xeet: font pack \`${name}\` is ${bytes.length} bytes, expected ${pack.bytes}`,
      );
    }
    for (const file of pack.files) {
      if (
        !Number.isInteger(file.offset) ||
        !Number.isInteger(file.length) ||
        file.offset < 0 ||
        file.length <= 0 ||
        file.offset + file.length > bytes.length
      ) {
        throw new Error(`xeet: font pack \`${name}\` has a bad entry for ${file.file}`);
      }
      register(file.file, bytes.subarray(file.offset, file.offset + file.length));
    }
    done.add(name);
  }

  function verify(name, digest) {
    const expected = packs[name].sha256;
    if (expected && digest !== expected) {
      throw new Error(
        `xeet: font pack \`${name}\` failed its SHA-256 check (got ${digest.slice(0, 12)}, expected ${expected.slice(0, 12)})`,
      );
    }
  }

  async function load(name) {
    if (name === "core" || done.has(name)) return;
    if (pending.has(name)) return pending.get(name);
    const pack = packs[name];
    if (!pack) throw new Error(`xeet: no font pack named \`${name}\` in packs.json`);
    const work = (async () => {
      const bytes = bytesOf(await read(name));
      verify(name, await hash(bytes));
      apply(name, bytes);
    })().catch((error) => {
      pending.delete(name);
      throw error;
    });
    pending.set(name, work);
    return work;
  }

  function loadSync(name) {
    if (name === "core" || done.has(name)) return;
    const pack = packs[name];
    if (!pack) throw new Error(`xeet: no font pack named \`${name}\` in packs.json`);
    const bytes = bytesOf(read(name));
    const digest = hash(bytes);
    if (typeof digest !== "string") {
      throw new Error("xeet: the synchronous loader needs a synchronous hash function");
    }
    verify(name, digest);
    apply(name, bytes);
  }

  /** Loads every pack a request needs and returns the names it loaded. */
  async function ensure(request) {
    if (typeof missingPacks !== "function") {
      throw new Error("xeet: this build has no missing_packs export; rebuild the wasm module");
    }
    const missing = JSON.parse(missingPacks(JSON.stringify(request)));
    for (const name of missing) await load(name);
    return missing;
  }

  /** [`ensure`] for a caller that cannot await (the Node sync entry point). */
  function ensureSync(request) {
    if (typeof missingPacks !== "function") {
      throw new Error("xeet: this build has no missing_packs export; rebuild the wasm module");
    }
    const missing = JSON.parse(missingPacks(JSON.stringify(request)));
    for (const name of missing) loadSync(name);
    return missing;
  }

  async function loadAll() {
    for (const name of Object.keys(packs)) await load(name);
  }

  function loadAllSync() {
    for (const name of Object.keys(packs)) loadSync(name);
  }

  /**
   * Starts every pack at once and resolves when they have all settled. The
   * page uses this after the core module boots so the carousel does not fetch
   * emoji or CJK on its first slide; `allSettled` means one failed pack does
   * not cancel the others, and `load` keeps the failed promise retryable.
   */
  function prefetchAll() {
    return Promise.allSettled(Object.keys(packs).map((name) => load(name)));
  }

  return {
    names: Object.keys(packs),
    loaded: () => [...done],
    load,
    loadSync,
    ensure,
    ensureSync,
    loadAll,
    loadAllSync,
    prefetchAll,
  };
}
