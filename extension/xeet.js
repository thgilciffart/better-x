(() => {
  const url = name => chrome.runtime.getURL('vendor/xeet/' + name)
  const packHost = 'https://cdn.jsdelivr.net/npm/@xeet/core@0.1.2/wasm/fonts/'
  let engine

  async function read(name) {
    const response = await fetch(url(name))
    if (!response.ok) throw new Error('Xeet asset is unavailable: ' + name)
    return response
  }

  async function download(name) {
    const cache = await caches.open('better-x-xeet-fonts')
    const address = packHost + name + '.bin'
    const cached = await cache.match(address)
    if (cached) return new Uint8Array(await cached.arrayBuffer())
    const response = await fetch(address)
    if (!response.ok) throw new Error('Xeet font pack is unavailable: ' + name)
    const bytes = new Uint8Array(await response.arrayBuffer())
    await cache.put(address, new Response(bytes.slice()))
    return bytes
  }

  async function pack(name) {
    const local = await fetch(url('fonts/' + name + '.bin')).catch(() => null)
    return local?.ok ? new Uint8Array(await local.arrayBuffer()) : download(name)
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
      read: pack,
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
    if (sender.id !== chrome.runtime.id || sender.tab) return
    if (message?.type === 'clipboard:copy-link' && typeof message.text === 'string') {
      const input = document.createElement('textarea')
      input.value = message.text
      document.body.append(input)
      input.select()
      const copied = document.execCommand('copy')
      input.remove()
      reply({ copied })
      return
    }
    if (message?.type !== 'xeet:render') return
    render(message.post, message.options).then(reply, error => {
      console.error(error)
      reply({ error: 'Xeet could not render this post.' })
    })
    return true
  })
})()
