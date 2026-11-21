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

  function encode(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  }

  const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
  const badgeIcons = {
    x: { light: 'icons/grok.svg', dark: 'icons/grok-dark.svg', size: 16 },
    google: { light: 'icons/translate.svg', dark: 'icons/translate.svg', size: 18, lift: 2 },
  }

  function languageName(code) {
    try {
      return code ? languageNames.of(code) : ''
    } catch {
      return ''
    }
  }

  function pixels(bitmap) {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    context.drawImage(bitmap, 0, 0)
    return context.getImageData(0, 0, bitmap.width, bitmap.height).data
  }

  function textOrigin(translated, blank, width, height) {
    let origin = null
    for (let y = 0; y < Math.min(height, blank.length / (width * 4)); y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4
        const delta = Math.abs(translated[index] - blank[index]) +
          Math.abs(translated[index + 1] - blank[index + 1]) +
          Math.abs(translated[index + 2] - blank[index + 2])
        if (delta <= 24) continue
        origin ??= { top: y, left: x }
        origin.left = Math.min(origin.left, x)
        break
      }
    }
    return origin
  }

  async function svgImage(name) {
    const image = new Image()
    image.src = chrome.runtime.getURL(name)
    await image.decode()
    return image
  }

  async function withBadge(png, badge, options, blankPng) {
    const scale = Math.max(1, Math.min(4, Number(options?.dpr) || 2))
    const dark = options?.theme === 'dark'
    const decode = async base64 => createImageBitmap(new Blob([
      Uint8Array.from(atob(base64), character => character.charCodeAt(0)),
    ], { type: 'image/png' }))
    const [bitmap, blank] = await Promise.all([decode(png), decode(blankPng)])
    const origin = textOrigin(pixels(bitmap), pixels(blank), bitmap.width, bitmap.height)
    const strip = Math.round(24 * scale)
    const top = origin?.top ?? 0
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height + strip
    const context = canvas.getContext('2d')
    context.fillStyle = dark ? '#000000' : '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const left = origin?.left ?? Math.round(16 * scale)
    context.drawImage(bitmap, 0, 0, left, bitmap.height, 0, 0, left, bitmap.height)
    context.drawImage(bitmap, left, 0, bitmap.width - left, top, left, 0, bitmap.width - left, top)
    context.drawImage(bitmap, left, top, bitmap.width - left, bitmap.height - top, left, top + strip,
      bitmap.width - left, bitmap.height - top)
    const art = badgeIcons[badge.provider] ?? badgeIcons.google
    const icon = await svgImage(dark ? art.dark : art.light)
    const size = Math.round(art.size * scale)
    context.drawImage(icon, left, top + Math.round((strip - size) / 2 - (art.lift ?? 0) * scale), size, size)
    const name = languageName(badge.language)
    context.fillStyle = dark ? '#71767b' : '#536471'
    context.font = Math.round(13 * scale) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    context.textBaseline = 'middle'
    context.fillText(name ? 'Translated from ' + name : 'Translated', left + size + Math.round(6 * scale), top + strip / 2 - Math.round(1 * scale))
    return encode(await new Promise(resolve => canvas.toBlob(resolve, 'image/png')))
  }

  async function render(post, options, badge) {
    const loaded = await (engine ??= load())
    if (!loaded) return { error: 'Xeet could not start. Reload better 𝕏 and try again.' }
    const { xeet, fonts } = loaded
    if (!await fonts.ensure({ post, options }).then(() => true, () => false)) {
      return { error: 'Could not download the fonts for this image. Check your connection and try again.' }
    }
    const png = await encode(new Blob([xeet.renderPng(post, options)], { type: 'image/png' }))
    if (!badge) return { png }
    const blank = await encode(new Blob([xeet.renderPng({ ...post, text: '.' }, options)], { type: 'image/png' }))
    return { png: await withBadge(png, badge, options, blank).catch(() => png) }
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
    render(message.post, message.options, message.badge).then(reply, error => {
      console.error(error)
      reply({ error: 'Xeet could not render this post.' })
    })
    return true
  })
})()
