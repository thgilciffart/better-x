(() => {
  const root = document.documentElement
  const selector = 'img[alt]:is([src^="https://abs-0.twimg.com/emoji/"], [src^="https://abs.twimg.com/emoji/"])'
  const rendered = 'data-better-x-emoji-image'
  const imageProperty = '--better-x-emoji-image'
  const images = new Map()
  let canvas
  let context
  let face
  let selected = ''
  let revision = 0

  function raster(emoji) {
    if (images.has(emoji)) return images.get(emoji)
    const { actualBoundingBoxLeft: left, actualBoundingBoxRight: right, actualBoundingBoxAscent: top,
      actualBoundingBoxDescent: bottom } = context.measureText(emoji)
    const width = left + right
    const height = top + bottom
    if (width <= 0 || height <= 0) return ''
    const size = canvas.width
    const scale = Math.min(1, (size - 4) / Math.max(width, height))
    context.clearRect(0, 0, size, size)
    context.save()
    context.translate(size / 2, size / 2)
    context.scale(scale, scale)
    context.fillText(emoji, (left - right) / 2, (top - bottom) / 2)
    context.restore()
    const url = `url("${canvas.toDataURL()}")`
    if (images.size >= 256) images.delete(images.keys().next().value)
    images.set(emoji, url)
    return url
  }

  function restore(image) {
    image.removeAttribute(rendered)
    image.style.removeProperty(imageProperty)
  }

  function update(image) {
    if (!image.matches(selector) || !image.alt || image.alt.length > 64) {
      restore(image)
      return
    }
    const glyph = `${selected}:${image.alt}`
    if (image.getAttribute(rendered) === glyph) return
    const url = raster(image.alt)
    if (!url) {
      restore(image)
      return
    }
    image.style.setProperty(imageProperty, url)
    image.setAttribute(rendered, glyph)
  }

  function scan(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (node.matches(selector)) update(node)
    for (const image of node.querySelectorAll(selector)) update(image)
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target.matches(selector) || record.target.hasAttribute(rendered)) update(record.target)
      } else {
        for (const node of record.addedNodes) scan(node)
      }
    }
  })

  function decode(font) {
    if (Uint8Array.fromBase64) return Uint8Array.fromBase64(font)
    const decoded = atob(font)
    const bytes = new Uint8Array(decoded.length)
    for (let i = 0; i < bytes.length; i++) bytes[i] = decoded.charCodeAt(i)
    return bytes
  }

  async function sync() {
    const font = BetterX.settings.emojiFont
    if (font === selected) return
    selected = font
    const request = ++revision
    root.removeAttribute('data-better-x-emoji-ready')
    observer.disconnect()
    if (face) document.fonts.delete(face)
    face = undefined
    images.clear()
    for (const image of document.querySelectorAll(`img[${rendered}]`)) restore(image)
    if (!font) return

    try {
      const result = await chrome.runtime.sendMessage({ type: 'emoji-font', font })
      if (request !== revision) return
      if (!result?.font) throw new Error(result?.error)
      const loaded = await new FontFace('BetterXEmoji', decode(result.font)).load()
      if (request !== revision) return
      face = loaded
      document.fonts.add(face)
      canvas ??= document.createElement('canvas')
      canvas.width = canvas.height = 96
      context = canvas.getContext('2d')
      context.font = '80px BetterXEmoji'
      scan(root)
      root.setAttribute('data-better-x-emoji-ready', '')
      observer.observe(root, { childList: true, subtree: true, attributeFilter: ['alt', 'src'] })
    } catch {
      if (request === revision) BetterX.notice('Could not load the emoji font. Refresh X to try again.')
    }
  }

  new MutationObserver(sync).observe(root, { attributeFilter: ['data-better-x-emoji-font'] })
  sync()
})()
