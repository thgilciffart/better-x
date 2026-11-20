(() => {
  const raw = 'https://raw.githubusercontent.com/'
  const sources = {
    apple: [
      'https://xeet-rs.vercel.app/wasm/d8cf89a6dde754d6/fonts/emoji.bin',
      'fe6d6552333cf4b078f557aeacc6995d45eec74b160a46489df4d4bb2f195ad1',
    ],
    noto: [
      raw + 'googlefonts/noto-emoji/v2.051/fonts/Noto-COLRv1.ttf',
      '0ae57fe58645638523ba35f388d93739d292539a9acb84df5700c81b1e1a28d2',
    ],
    segoe: [
      raw + 'skeyuui/windows-seguiemj-emoji-tracker/74b8e92fca5e9740ccadee7ded1cbcabb4e70f55/seguiemj.ttf',
      'f07cbd7886f4a1a5255a1bdf4ca5ea29db3be3357414003a92bec5d1c3165578',
    ],
    twemoji: [
      raw + 'mozilla-firefox/firefox/9197ef9fdb2a3aea5636ed89c579d1af4fe499fa/browser/fonts/TwemojiMozilla.ttf',
      '6d90152ee0d29e82fe2a87793af5aa4b7ad13e6538360889e141e81ed299ee8e',
    ],
    fluent: [
      raw + 'BygNet/Emojis/f68704412fe7ee444b494da0b3d76f70159e85f2/dist/FluentEmojiFlat.ttf',
      '951da552e63bd9e6b4ee375fe711a0cf523553568dd9c203888a43f872ab0dbb',
    ],
    samsung: [
      raw + 'RealityRipple/oneui-emoji/d587ab50481ff2fd2cd48d27ced7489d2b2ecf6c/OneUI.ttf',
      'a3c7b8db7cd24dfd5558c433a1e6f3c08ee06011de2b70f9a0c197b18f7dd4d1',
    ],
    openmoji: [
      raw + 'hfg-gmuend/openmoji/17.0.0/font/OpenMoji-color-glyf_colr_1/OpenMoji-color-glyf_colr_1.woff2',
      'eae63de27eb3b001b723710ce5cd03097064092a9c3ec19eabeff2cdcf20b602',
    ],
  }
  const pending = new Map()

  async function read(font) {
    const [url, hash] = sources[font]
    const cache = await caches.open('better-x-emoji-fonts')
    const request = new Request(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
    const cached = await cache.match(request)
    if (cached) return new Uint8Array(await cached.arrayBuffer())

    let bytes
    try {
      const response = await fetch(request)
      if (!response.ok) throw new Error()
      bytes = new Uint8Array(await response.arrayBuffer())
    } catch {
      throw new Error('Could not download the emoji font. Try again.')
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    if ([...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') !== hash) {
      throw new Error('Could not verify the emoji font.')
    }
    await cache.put(request, new Response(bytes))
    return bytes
  }

  function load(font) {
    if (!pending.has(font)) pending.set(font, read(font).finally(() => pending.delete(font)))
    return pending.get(font)
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

  globalThis.BetterXEmojiFonts = { load, encode }
})()
