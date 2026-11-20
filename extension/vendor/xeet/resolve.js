// `resolve`: the resolver library, from JavaScript.
//
// The rules are Rust (`crates/xeet-resolve`); this module is the JS side of the
// call, plus the adapter that turns a WHATWG `fetch` into the host the library
// asks for. Two facts about that host matter and are worth saying twice:
//
//   - The library follows redirects itself, so the adapter must send
//     `redirect: "manual"`. A browser returns an *opaque* response for that
//     ("opaqueredirect", status 0, no headers), which is why browser use needs a
//     CORS-capable proxy that can expose `location` — see docs/RESOLVE.md.
//   - The library polices addresses itself when a `lookup` is provided; a
//     browser has no DNS, so a browser host omits it and the library falls back
//     to refusing private IP *literals*, with the proxy responsible for the rest.
//
// ```js
// import { loadXeet } from "xeet/node";
// const xeet = await loadXeet();
// const resolved = await xeet.resolve("look: https://t.co/jO01BMGwXr", { media: true, width: 390, dpr: 2 });
// resolved.post.links // { "https://t.co/jO01BMGwXr": { card: "summary_large_image", … } }
// ```

/** The options the library understands, with the defaults it uses. */
export const RESOLVE_DEFAULTS = Object.freeze({
  media: false,
  width: 600,
  dpr: 2,
  surface: "web-timeline",
  maxLinks: 4,
  refresh: false,
});

/**
 * A WHATWG `fetch` plus optional pieces, as the host object `crates/xeet-wasm`
 * documents. `fetch` is the only required member.
 *
 * @param {{fetch?: Function, lookup?: (host: string) => Promise<string[]>,
 *          cacheGet?: (key: string) => Promise<{value: string, storedAt: number} | null>,
 *          cacheSet?: (key: string, value: string, storedAt: number) => Promise<void> | void,
 *          now?: () => number}} parts
 */
export function whatwgHost(parts = {}) {
  const fetchImpl = parts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("xeet: no fetch implementation; pass one as { fetch }");
  }
  const host = {
    async fetch(request) {
      const timeoutMs = Math.max(500, Number(request.timeoutMs) || 8_000);
      const signal = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
      const response = await fetchImpl(request.url, {
        method: request.method ?? "GET",
        headers: request.headers ?? {},
        redirect: "manual",
        ...(signal ? { signal } : {}),
      });
      if (response.type === "opaqueredirect") {
        throw Object.assign(new Error("the browser hid this redirect (opaque response)"), {
          blocked: "opaque_redirect",
        });
      }
      // Read up to the cap and stop, never the whole response: an oversized
      // upstream body used to be buffered in full before the limit applied.
      // The first `maxBytes` are still delivered, truncated: the library reads
      // a cut page's head for its card tags.
      const maxBytes = request.maxBytes ?? Infinity;
      let truncated = false;
      const chunks = [];
      let total = 0;
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (total + value.byteLength > maxBytes) {
            chunks.push(value.subarray(0, Math.max(0, maxBytes - total)));
            total = maxBytes;
            truncated = true;
            await reader.cancel().catch(() => {});
            break;
          }
          chunks.push(value);
          total += value.byteLength;
        }
      } else {
        const whole = new Uint8Array(await response.arrayBuffer());
        truncated = whole.byteLength > maxBytes;
        chunks.push(whole.subarray(0, Math.min(whole.byteLength, maxBytes)));
        total = chunks[0].byteLength;
      }
      const body = new Uint8Array(total);
      let at = 0;
      for (const chunk of chunks) {
        body.set(chunk, at);
        at += chunk.byteLength;
      }
      const headers = {};
      response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });
      return {
        status: response.status,
        headers,
        body,
        truncated,
      };
    },
  };
  if (parts.lookup) host.lookup = parts.lookup;
  if (parts.cacheGet) host.cacheGet = parts.cacheGet;
  if (parts.cacheSet) host.cacheSet = parts.cacheSet;
  if (parts.now) host.now = parts.now;
  return host;
}

/** A cache that forgets, for a one-shot call. */
export function noCache() {
  return {
    async cacheGet() {
      return null;
    },
    cacheSet() {},
  };
}

/** An in-memory cache, `{key: {value, storedAt}}`. Useful in a worker or a test. */
export function memoryCache() {
  const entries = new Map();
  return {
    async cacheGet(key) {
      return entries.get(key) ?? null;
    },
    async cacheSet(key, value, storedAt) {
      entries.set(key, { value, storedAt });
    },
    get size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}

/** `{media, width, dpr, …}` → the JSON the wasm export takes. */
function wireOptions(options = {}, host) {
  const media = options.media ?? RESOLVE_DEFAULTS.media;
  const maxLinks =
    options.links === false ? 0 : (options.maxLinks ?? (options.max_links ?? RESOLVE_DEFAULTS.maxLinks));
  const hostNowMs = typeof host?.now === "function" ? Number(host.now()) : NaN;
  const nowMs = Number.isFinite(hostNowMs) && hostNowMs > 0 ? hostNowMs : Date.now();
  return JSON.stringify({
    media: media !== false,
    width: options.width ?? RESOLVE_DEFAULTS.width,
    dpr: options.dpr ?? RESOLVE_DEFAULTS.dpr,
    surface: options.surface ?? RESOLVE_DEFAULTS.surface,
    maxLinks,
    now: options.now ?? new Date(nowMs).toISOString(),
    nowMs,
    refresh: options.refresh === true,
    // Test seam, the same one the JS resolver has (`XEET_LINKS_ALLOW_PRIVATE`):
    // the offline fixture server listens on 127.0.0.1, which the library refuses
    // by design. No shipped wrapper sets it.
    ...(options.allowHosts?.length ? { allowHosts: options.allowHosts } : {}),
  });
}

/** The library's rejection (a JSON string) as an Error with `code`/`status`/`fields`. */
function toError(rejection) {
  let body = rejection;
  if (typeof rejection === "string") {
    try {
      body = JSON.parse(rejection);
    } catch {
      body = { message: rejection };
    }
  }
  if (body && typeof body === "object" && "message" in body) {
    const error = new Error(body.message);
    error.name = "ResolveError";
    error.code = body.code ?? "resolve_failed";
    error.status = body.status ?? 502;
    error.fields = body.fields ?? [];
    return error;
  }
  return Object.assign(new Error(String(rejection)), { name: "ResolveError", code: "resolve_failed", status: 502 });
}

/**
 * Wraps an instantiated module: `{ resolve(input, options, host), resolveLinks(url, options, host) }`.
 * @param {{resolve?: Function, resolve_links?: Function}} wasm
 */
export function bindResolve(wasm) {
  if (typeof wasm?.resolve !== "function" || typeof wasm?.resolve_links !== "function") {
    throw new Error("xeet: this build of the module has no resolve export (rebuild with tools/ship/build-wasm.mjs)");
  }
  return {
    /**
     * Post text, an x.com post URL, or post JSON → `{post, links, media, source, warnings}`.
     * @param {string} input
     * @param {object} [options]
     * @param {object} [host] defaults to `whatwgHost()`
     */
    async resolve(input, options = {}, host = whatwgHost()) {
      let json;
      try {
        json = await wasm.resolve(String(input), wireOptions(options, host), host);
      } catch (rejection) {
        throw toError(rejection);
      }
      return JSON.parse(json);
    },

    /**
     * One URL → `{meta, chain, finalUrl, tags, imageUrl, notes, cached, image?}`.
     * @param {string} url
     * @param {object} [options]
     * @param {object} [host]
     */
    async resolveLinks(url, options = {}, host = whatwgHost()) {
      let json;
      try {
        json = await wasm.resolve_links(String(url), wireOptions(options, host), host);
      } catch (rejection) {
        throw toError(rejection);
      }
      return JSON.parse(json);
    },
  };
}
