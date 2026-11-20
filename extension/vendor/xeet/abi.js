// The frame the WebAssembly module returns, and the object the rest of the
// package talks to.
//
// The Rust side (`crates/xeet-wasm/src/lib.rs`) documents the layout:
//
//   offset 0   u8   status: 0 = ok, 1 = error
//   offset 1   u32  payload length  (little endian)   PNG bytes, or JSON
//   offset 5   u32  report length   (little endian)   JSON, render only
//   offset 9   u32  total length    (little endian)
//   offset 13  ...  payload, then report
//
// There is no pointer arithmetic here any more: wasm-bindgen hands back a
// `Uint8Array` copy, so the host never touches the module's memory.

export const OP_EXPLAIN = 0;
export const OP_RENDER = 1;
export const OP_SHEET = 2;
/** A raster instead of a PNG: `width | height | RGBA8`. */
export const OP_RENDER_RGBA = 3;
/** One post, several option sets: one PNG plus report each. */
export const OP_RENDER_BATCH = 4;

/** Header size: status, payload length, report length, total length. */
export const HEADER = 13;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: false });

import { bindResolve, whatwgHost } from "./resolve.js";

/** An error the renderer reported, with the fields it is about. */
export class XeetError extends Error {
  constructor(body) {
    super(body.message ?? "xeet: the request failed");
    this.name = "XeetError";
    this.code = body.code ?? "render_failed";
    this.status = body.status ?? 500;
    this.fields = body.fields ?? [];
    this.notes = body.notes ?? [];
  }
}

/**
 * Splits a frame into its parts.
 * @param {Uint8Array} buf
 */
export function unframe(buf) {
  if (!buf || buf.length < HEADER) throw new XeetError({ code: "render_failed", message: "xeet: the module returned a short frame" });
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const status = buf[0];
  const payloadLen = view.getUint32(1, true);
  const reportLen = view.getUint32(5, true);
  const total = view.getUint32(9, true);
  if (total !== buf.length) throw new XeetError({ code: "render_failed", message: `xeet: frame says ${total} bytes, got ${buf.length}` });
  const payload = buf.subarray(HEADER, HEADER + payloadLen);
  const report = reportLen ? buf.subarray(HEADER + payloadLen, HEADER + payloadLen + reportLen) : null;
  if (status !== 0) {
    let body;
    try {
      body = JSON.parse(decoder.decode(payload));
    } catch {
      body = { code: "render_failed", message: decoder.decode(payload) || "xeet: the render failed" };
    }
    throw new XeetError(body);
  }
  return { payload, report: report ? JSON.parse(decoder.decode(report)) : null };
}

/** The error for a batch frame that ends before its items do. */
function shortBatch() {
  return new XeetError({ code: "render_failed", message: "xeet: the batch frame ended before its items did" });
}

/**
 * Wraps the wasm-bindgen module: `call(op, json) -> Uint8Array` and
 * `upstream_version() -> string`.
 *
 * @param {{ call: (op: number, request: string) => Uint8Array, upstream_version: () => string }} wasm
 */
export function bind(wasm) {
  const call = (op, request) => unframe(wasm.call(op, JSON.stringify(request)));

  // The resolver shares the module but not the ABI: it is a separate export
  // (`resolve`, `resolve_links`) that returns promises. A build that predates it
  // simply has no `resolve` member, so `bind` stays additive.
  const resolver = typeof wasm.resolve === "function" && typeof wasm.resolve_links === "function"
    ? bindResolve(wasm)
    : null;

  return {
    /** The upstream app version this build embeds, e.g. "89824c04…". */
    upstream: wasm.upstream_version(),

    /** The JSON report and nothing else. */
    explain(post, options) {
      const { payload } = call(OP_EXPLAIN, { op: "explain", post, options });
      return JSON.parse(decoder.decode(payload));
    },

    /**
     * Whether `post` renders with a "Show more" affordance under `options`
     * (evaluated in collapsed state, with no rasterization).
     */
    hasShowMore(post, options) {
      const collapsed = options ? { ...options, expanded: false } : { expanded: false };
      const { payload } = call(OP_EXPLAIN, { op: "explain", post, options: collapsed });
      return Boolean(JSON.parse(decoder.decode(payload))?.text?.hasShowMore);
    },

    /** A PNG and its report. */
    render(post, options) {
      const { payload, report } = call(OP_RENDER, { op: "render", post, options });
      return { png: payload, report };
    },

    /** Just the PNG bytes, for callers that do not need the report. */
    renderPng(post, options) {
      return call(OP_RENDER, { op: "render", post, options }).payload;
    },

    /**
     * The raster itself, for callers that are not shipping a PNG:
     * `{ width, height, rgba, report }`, with `rgba` straight from the frame.
     */
    renderRgba(post, options) {
      const { payload, report } = call(OP_RENDER_RGBA, { op: "renderRgba", post, options });
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const width = view.getUint32(0, true);
      const height = view.getUint32(4, true);
      const need = 8 + width * height * 4;
      if (payload.length < need) {
        throw new XeetError({
          code: "render_failed",
          message: `xeet: the raster says ${width}×${height}, got ${payload.length} bytes`,
        });
      }
      return { width, height, rgba: payload.subarray(8, need), report };
    },

    /**
     * Several option sets over one post → `[{ png, report, paint }, …]`.
     *
     * The post is parsed and validated once and the decoded media is shared, so
     * this is how a caller renders one post at several layouts without paying
     * for the images four times over. `paint` is that item's render time in
     * milliseconds, for callers that show it.
     */
    renderMany(post, optionsList) {
      const batch = Array.isArray(optionsList) ? optionsList : [optionsList];
      const { payload } = call(OP_RENDER_BATCH, { op: "renderBatch", post, batch });
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const count = view.getUint32(0, true);
      const items = [];
      let at = 4;
      for (let i = 0; i < count; i++) {
        if (at + 12 > payload.length) throw shortBatch();
        const pngLen = view.getUint32(at, true);
        const reportLen = view.getUint32(at + 4, true);
        const durationUs = view.getUint32(at + 8, true);
        at += 12;
        if (at + pngLen + reportLen > payload.length) throw shortBatch();
        const png = payload.subarray(at, at + pngLen);
        at += pngLen;
        const report = reportLen ? JSON.parse(decoder.decode(payload.subarray(at, at + reportLen))) : null;
        at += reportLen;
        items.push({ png, report, paint: durationUs / 1000 });
      }
      return items;
    },

    /**
     * Post text, an x.com post URL, or post JSON → `{post, links, media, source, warnings}`.
     * The rules run in Rust; the network comes from `host` (docs/RESOLVE.md).
     */
    resolve(input, options = {}, host) {
      if (!resolver) throw new Error("xeet: this build has no resolve export (rebuild with tools/ship/build-wasm.mjs)");
      return host ? resolver.resolve(input, options, host) : resolver.resolve(input, options);
    },

    /** One URL's card metadata, for `/resolve-links`. */
    resolveLinks(url, options = {}, host) {
      if (!resolver) throw new Error("xeet: this build has no resolve export (rebuild with tools/ship/build-wasm.mjs)");
      return host ? resolver.resolveLinks(url, options, host) : resolver.resolveLinks(url, options);
    },

    /** The host adapter, so a caller can build one from its own fetch. */
    whatwgHost,

    /** Several viewports and themes in one labeled PNG. */
    sheet(request) {
      const { post, widths, themes, dpr } = request ?? {};
      return call(OP_SHEET, {
        op: "sheet",
        post,
        widths: widths ?? [320, 390, 600],
        themes: themes ?? ["light", "dark"],
        dpr: dpr ?? 2,
      }).payload;
    },
  };
}

export { encoder };
