(() => {
  const mediaHost = 'pbs.twimg.com'
  const wordSegments = new Intl.Segmenter(undefined, { granularity: 'word' })
  const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

  function content(element) {
    if (!element) return ''
    const copy = element.cloneNode(true)
    for (const emoji of copy.querySelectorAll('img[alt]')) emoji.replaceWith(emoji.alt)
    for (const br of copy.querySelectorAll('br')) br.replaceWith('\n')
    return copy.textContent.trim()
  }

  function wrap(context, text, width) {
    const lines = []
    for (const paragraph of text.split('\n')) {
      let line = ''
      for (const { segment } of wordSegments.segment(paragraph)) {
        if (context.measureText(line + segment).width <= width) {
          line += segment
          continue
        }
        if (line.trim()) lines.push(line.trimEnd())
        line = ''
        for (const { segment: character } of characters.segment(segment.trimStart())) {
          if (context.measureText(line + character).width > width && line) {
            lines.push(line)
            line = ''
          }
          line += character
        }
      }
      lines.push(line.trimEnd())
    }
    return lines
  }

  async function loadImage(source) {
    if (!source) return null
    const url = new URL(source, location.origin)
    if (url.protocol !== 'https:' || url.hostname !== mediaHost) return null
    try {
      const response = await fetch(url, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(4000),
      })
      if (response.ok) return await createImageBitmap(await response.blob())
    } catch {}
    return null
  }

  function drawImage(context, image, x, y, width, height, radius) {
    context.save()
    context.beginPath()
    context.roundRect(x, y, width, height, radius)
    context.clip()
    const scale = Math.max(width / image.width, height / image.height)
    const scaledWidth = image.width * scale
    const scaledHeight = image.height * scale
    context.drawImage(image, x + (width - scaledWidth) / 2, y + (height - scaledHeight) / 2, scaledWidth, scaledHeight)
    context.restore()
  }

  async function render(post, link) {
    const heading = post.querySelector('[data-testid="User-Name"]')
    const handle = link.pathname.split('/')[1]
    const profile = heading?.querySelector('a[href="/' + handle + '"]')
    const name = content(profile) || (handle === 'i' ? 'X post' : handle)
    const time = content(post.querySelector('time'))
    const text = content(post.querySelector('[data-testid="tweetText"]')).slice(0, 12000)
    const avatar = post.querySelector('[data-testid^="UserAvatar-Container"] img')?.src
    const media = [...new Set(Array.from(
      post.querySelectorAll('[data-testid="tweetPhoto"] img, [data-testid="videoPlayer"] video[poster]'),
      element => element instanceof HTMLVideoElement ? element.poster : element.currentSrc || element.src,
    ))].slice(0, 4)
    const [avatarImage, ...candidates] = await Promise.all([avatar, ...media].map(loadImage))
    const images = candidates.filter(Boolean)

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    const width = 560
    const padding = 24
    const innerWidth = width - padding * 2
    const font = 'system-ui, sans-serif'
    context.font = '16px ' + font
    const lines = text ? wrap(context, text, innerWidth).slice(0, 110) : []
    const columns = images.length > 1 ? 2 : 1
    const gap = 5
    const imageWidth = (innerWidth - gap * (columns - 1)) / columns
    const imageHeight = images.length === 1
      ? Math.round(Math.min(440, imageWidth * images[0].height / images[0].width))
      : 150
    const rows = Math.ceil(images.length / columns)
    const height = 90 + lines.length * 23 + (rows ? rows * (imageHeight + gap) + 12 : 0)
    canvas.width = width * 2
    canvas.height = height * 2
    context.scale(2, 2)

    context.fillStyle = '#111112'
    context.fillRect(0, 0, width, height)
    if (avatarImage) drawImage(context, avatarImage, padding, padding, 40, 40, 20)
    const headerX = avatarImage ? padding + 52 : padding
    context.fillStyle = '#ededeb'
    context.font = '600 16px ' + font
    context.fillText(name, headerX, 40, width - headerX - padding)
    context.fillStyle = '#a2a2a2'
    context.font = '14px ' + font
    context.fillText([handle === 'i' ? '' : '@' + handle, time].filter(Boolean).join(' · '), headerX, 60, width - headerX - padding)

    context.fillStyle = '#ededeb'
    context.font = '16px ' + font
    lines.forEach((line, index) => context.fillText(line, padding, 87 + index * 23))
    const mediaY = 72 + lines.length * 23 + (lines.length ? 8 : 0)
    images.forEach((image, index) => drawImage(
      context, image,
      padding + (index % columns) * (imageWidth + gap),
      mediaY + Math.floor(index / columns) * (imageHeight + gap),
      imageWidth, imageHeight, 8,
    ))
    for (const image of [avatarImage, ...images]) image?.close()
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not render post image')), 'image/png')
    })
  }

  globalThis.BetterX.copyPostImage = (post, link) => navigator.clipboard.write([
    new ClipboardItem({ 'image/png': render(post, link) }),
  ])
})()
