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

  BetterX.xeet = () => engine ??= load()
})()
