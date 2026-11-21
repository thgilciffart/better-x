(() => {
  const raw = 'https://raw.githubusercontent.com/'
  const cacheName = 'better-x-emoji-fonts'
  const appleCacheKey = 'https://xeet-rs.vercel.app/wasm/d8cf89a6dde754d6/fonts/emoji.bin'
  const sources = {
    apple: [
      'https://cdn.jsdelivr.net/npm/@xeet/core@0.1.2/wasm/fonts/emoji.bin',
      'fe6d6552333cf4b078f557aeacc6995d45eec74b160a46489df4d4bb2f195ad1',
      20930352,
      raw + 'rauchg/xeet/095ba15047fe5111bd93c64a726c027eb9794960/assets/vendor/fonts/AppleColorEmoji.ttf',
      'https://unpkg.com/@xeet/core@0.1.2/wasm/fonts/emoji.bin',
    ],
    noto: [
      raw + 'googlefonts/noto-emoji/v2.051/fonts/Noto-COLRv1.ttf',
      '0ae57fe58645638523ba35f388d93739d292539a9acb84df5700c81b1e1a28d2',
      4991984,
    ],
    segoe: [
      raw + 'skeyuui/windows-seguiemj-emoji-tracker/74b8e92fca5e9740ccadee7ded1cbcabb4e70f55/seguiemj.ttf',
      'f07cbd7886f4a1a5255a1bdf4ca5ea29db3be3357414003a92bec5d1c3165578',
      12450664,
    ],
    twemoji: [
      raw + 'mozilla-firefox/firefox/9197ef9fdb2a3aea5636ed89c579d1af4fe499fa/browser/fonts/TwemojiMozilla.ttf',
      '6d90152ee0d29e82fe2a87793af5aa4b7ad13e6538360889e141e81ed299ee8e',
      1474284,
    ],
    fluent: [
      raw + 'BygNet/Emojis/f68704412fe7ee444b494da0b3d76f70159e85f2/dist/FluentEmojiFlat.ttf',
      '951da552e63bd9e6b4ee375fe711a0cf523553568dd9c203888a43f872ab0dbb',
      26888932,
    ],
    samsung: [
      raw + 'RealityRipple/oneui-emoji/d587ab50481ff2fd2cd48d27ced7489d2b2ecf6c/OneUI.ttf',
      'a3c7b8db7cd24dfd5558c433a1e6f3c08ee06011de2b70f9a0c197b18f7dd4d1',
      20524872,
    ],
    openmoji: [
      raw + 'hfg-gmuend/openmoji/17.0.0/font/OpenMoji-color-glyf_colr_1/OpenMoji-color-glyf_colr_1.woff2',
      'eae63de27eb3b001b723710ce5cd03097064092a9c3ec19eabeff2cdcf20b602',
      1048752,
    ],
  }

  function cacheKey(font) {
    return font === 'apple' ? appleCacheKey : sources[font][0]
  }

  function cached(font) {
    return caches.match(cacheKey(font), { cacheName })
  }

  async function download(font) {
    if (await cached(font)) return
    const [primary, hash, size, ...mirrors] = sources[font]
    let invalid = false

    for (const url of [primary, ...mirrors]) {
      let bytes
      try {
        const response = await fetch(url, {
          credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(60000),
        })
        if (!response.ok) continue
        bytes = await response.arrayBuffer()
      } catch {
        continue
      }
      if (bytes.byteLength === size) {
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
        if ([...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') === hash) {
          const cache = await caches.open(cacheName)
          await cache.put(cacheKey(font), new Response(bytes))
          return
        }
      }
      invalid = true
    }
    if (invalid) throw new Error('Could not verify the emoji font.')
    throw new Error('Could not download the emoji font. Try again.')
  }

  async function list() {
    const requests = await (await caches.open(cacheName)).keys()
    const stored = new Set(requests.map(request => request.url))
    return Object.fromEntries(Object.entries(sources).map(([font, [, , size]]) => [
      font, { size, downloaded: stored.has(cacheKey(font)) },
    ]))
  }

  function encode(bytes) {
    if (bytes.toBase64) return bytes.toBase64()
    const chunks = []
    const size = 24576
    for (let offset = 0; offset < bytes.length; offset += size) {
      chunks.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + size))))
    }
    return chunks.join('')
  }

  globalThis.BetterXEmojiFonts = { cacheName, cached, download, list, encode }
})()
