(() => {
  const url = name => chrome.runtime.getURL('vendor/xeet/' + name)
  let engine

  async function read(name) {
    const response = await fetch(url(name))
    if (!response.ok) throw new Error('Xeet asset is unavailable: ' + name)
    return response
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
      read: name => read('fonts/' + name + '.bin').then(async response => new Uint8Array(await response.arrayBuffer())),
      hash: sha256Hex,
      register: wasm.register_font,
      missingPacks: wasm.missing_packs,
    })
    return { xeet: bind(wasm), fonts }
  }

  async function render(post, options) {
    const loaded = await (engine ??= load())
    if (!loaded) return { error: 'Set up Xeet with npm run setup:xeet, then reload Better X.' }
    const { xeet, fonts } = loaded
    await fonts.ensure({ post, options })
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
