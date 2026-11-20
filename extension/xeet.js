(() => {
  const url = name => chrome.runtime.getURL('vendor/xeet/' + name)
  const fontHost = 'https://xeet-rs.vercel.app/wasm/d8cf89a6dde754d6/fonts/'
  let engine

  async function read(name) {
    const response = await fetch(url(name))
    if (!response.ok) throw new Error('Xeet asset is unavailable: ' + name)
    return response
  }

  async function pack(name, manifest, sha256Hex) {
    const address = fontHost + name + '.bin'
    const cache = await caches.open('better-x-xeet-fonts')
    const cached = await cache.match(address)
    if (cached) return new Uint8Array(await cached.arrayBuffer())
    const response = await fetch(address)
    if (!response.ok) throw new Error('Xeet font pack is unavailable: ' + name)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (await sha256Hex(bytes) === manifest.packs[name]?.sha256) await cache.put(address, new Response(bytes))
    return bytes
  }

  async function load() {
    const manifest = await read('fonts/packs.json').then(response => response.json()).catch(() => null)
    if (!manifest) return null
    const [wasm, { bind }, { createFontPacks, sha256Hex }] = await Promise.all([
      import(url('xeet_wasm.js')),
      import(url('abi.js')),
      import(url('fonts.js')),
    ])
    await wasm.default()
    const fonts = createFontPacks({
      manifest,
      read: name => pack(name, manifest, sha256Hex),
      hash: sha256Hex,
      register: wasm.register_font,
      missingPacks: wasm.missing_packs,
    })
    return { xeet: bind(wasm), fonts }
  }

  async function render(post, options) {
    const loaded = await (engine ??= load())
    if (!loaded) return { error: 'Xeet could not start. Reload better 𝕏 and try again.' }
    const { xeet, fonts } = loaded
    if (!await fonts.ensure({ post, options }).then(() => true, () => false)) {
      return { error: 'Could not download the fonts for this image. Check your connection and try again.' }
    }
    const blob = new Blob([xeet.renderPng(post, options)], { type: 'image/png' })
    const png = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    return { png }
  }

  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message?.type !== 'xeet:render' || sender.id !== chrome.runtime.id || sender.tab) return
    render(message.post, message.options).then(reply, error => {
      console.error(error)
      reply({ error: 'Xeet could not render this post.' })
    })
    return true
  })
})()
