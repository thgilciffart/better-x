(() => {
  const { postSelector, settings } = BetterX
  const postData = new Map()
  const showMore = '[data-testid="tweet-text-show-more-link"], [data-testid="tweet-text-show-more"], [data-testid="showMore"]'
  const actionSelectors = [
    '[data-testid="reply"]',
    '[data-testid="retweet"], [data-testid="unretweet"]',
    '[data-testid="like"], [data-testid="unlike"]',
    'a[href$="/analytics"], [data-testid="analytics"]',
    '[data-testid="bookmark"], [data-testid="removeBookmark"]',
    '[data-testid="share"], [aria-label*="share" i], [aria-haspopup="menu"]:not([data-testid])',
  ]
  const palettes = {
    light: { background: '#fcfcfc', text: '#101114', meta: '#656970', surface: '#f1f2f3' },
    dark: { background: '#0f1012', text: '#f0f0f1', meta: '#a0a4aa', surface: '#1d2023' },
  }

  document.addEventListener('better-x:post-data', event => {
    try {
      for (const [id, value] of JSON.parse(event.detail)) {
        if (typeof id !== 'string' || !/^\d+$/.test(id) || typeof value?.text !== 'string') continue
        postData.delete(id)
        postData.set(id, value)
        if (postData.size > 96) postData.delete(postData.keys().next().value)
      }
    } catch {}
  })

  const mediaHost = 'pbs.twimg.com'
  const wordSegments = new Intl.Segmenter(undefined, { granularity: 'word' })
  const characters = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

  function content(element) {
    if (!element) return ''
    const copy = element.cloneNode(true)
    for (const more of copy.querySelectorAll(showMore)) more.remove()
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

  async function imageBlob(source) {
    if (!source) return null
    const url = new URL(source, location.origin)
    if (url.protocol !== 'https:' || url.hostname !== mediaHost) return null
    try {
      const response = await fetch(url, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(4000),
      })
      if (response.ok) return await response.blob()
    } catch {}
    return null
  }

  async function loadImage(source) {
    const blob = await imageBlob(source)
    return blob ? createImageBitmap(blob).catch(() => null) : null
  }

  async function encodeImage(source) {
    const blob = await imageBlob(source)
    if (!blob) return undefined
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = () => resolve(undefined)
      reader.readAsDataURL(blob)
    })
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

  function ownElements(post, selector) {
    return Array.from(post.querySelectorAll(selector)).filter(element => element.closest(postSelector) === post)
  }

  function glyph(element) {
    const svg = element?.matches('svg') ? element : element?.querySelector('svg')
    const view = svg?.viewBox.baseVal
    if (!view?.width || !view.height) return null
    const paths = [...svg.querySelectorAll('path[d]')].map(path => new Path2D(path.getAttribute('d')))
    return paths.length ? { view, paths } : null
  }

  function drawGlyph(context, icon, x, y, size) {
    if (!icon) return
    const { view, paths } = icon
    context.save()
    context.translate(x, y)
    context.scale(size / view.width, size / view.height)
    context.translate(-view.x, -view.y)
    for (const path of paths) context.fill(path)
    context.restore()
  }

  async function render(post, link) {
    const { surface, width, dpr, theme, fontScale, expanded, autoExpand } = settings.imageExport
    const ios = surface.startsWith('ios')
    const detail = surface.endsWith('detail')
    const palette = palettes[theme]
    const [heading] = ownElements(post, '[data-testid="User-Name"]')
    const [body] = ownElements(post, '[data-testid="tweetText"]')
    const handle = link.pathname.split('/')[1]
    const id = link.pathname.split('/').at(-1)
    const profile = heading?.querySelector('a[href="/' + handle + '"]')
    const name = content(profile) || (handle === 'i' ? 'X post' : handle)
    const time = content(ownElements(post, 'time')[0])
    const hasMore = Boolean(ownElements(post, showMore).length)
    const fullText = expanded || (autoExpand && hasMore) ? postData.get(id)?.text : undefined
    const renderedText = fullText || content(body)
    const text = renderedText.slice(0, 16000)
    const fontFamily = getComputedStyle(body || heading || post).fontFamily
    const family = /^(serif|["']?Times New Roman["']?)$/i.test(fontFamily) ? 'Arial, sans-serif' : fontFamily
    const verifiedElement = heading?.querySelector('[data-testid^="icon-verified"], svg[aria-label*="verified" i]')
    const verified = glyph(verifiedElement)
    const caret = glyph(ownElements(post, '[data-testid="caret"]')[0])
    const [group] = ownElements(post, '[role="group"]')
    const actions = actionSelectors.map(selector => {
      const control = group?.querySelector(selector)
      const count = content(control?.querySelector('[data-testid="app-text-transition-container"]')) ||
        content(control).match(/^\d+(?:[.,]\d+)?[KMB]?$/i)?.[0] || ''
      return { icon: glyph(control), count }
    })
    const avatar = ownElements(post, '[data-testid^="UserAvatar-Container"] img')[0]?.src
    const quote = Array.from(post.querySelectorAll(postSelector)).find(element => element.parentElement.closest(postSelector) === post)
    const quoteText = quote && content(ownElements(quote, '[data-testid="tweetText"]')[0]).slice(0, 800)
    const media = [...new Set(ownElements(post, '[data-testid="tweetPhoto"] img, [data-testid="videoPlayer"] video[poster]')
      .map(element => element instanceof HTMLVideoElement ? element.poster : element.currentSrc || element.src))].slice(0, 4)

    const bodySize = (detail ? 20 : ios ? 16 : 15) * fontScale
    const nameSize = (ios ? 16 : 15) * fontScale
    const metaSize = (ios ? 15 : 14) * fontScale
    const lineHeight = Math.ceil(bodySize * 1.33)
    const font = (size, weight = 400) => `${weight} ${size}px ${family}`
    const [[avatarImage, ...candidates]] = await Promise.all([
      Promise.all([avatar, ...media].map(loadImage)),
      Promise.allSettled([document.fonts.load(font(bodySize), text), document.fonts.load(font(nameSize, 700), name)]),
    ])
    const images = candidates.filter(Boolean)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    const padding = ios ? 10 : 14
    const top = ios ? 12 : 14
    const avatarSize = ios ? 48 : 40
    const headerX = padding + avatarSize + 8
    const bodyX = detail ? padding : headerX
    const bodyY = detail ? top + avatarSize + 12 : top + Math.ceil(nameSize * 1.4)
    const bodyWidth = width - bodyX - padding
    context.font = font(bodySize)
    const visibleText = text + (text.length < renderedText.length ? '…' : hasMore && !fullText ? '  Show more' : '')
    const lines = visibleText ? wrap(context, visibleText, bodyWidth) : []
    if (lines.length > 120) lines.splice(119, lines.length, '…')
    const quoteSize = 14 * fontScale
    const quoteLineHeight = Math.ceil(quoteSize * 1.4)
    context.font = font(quoteSize)
    const quoteLines = quoteText ? wrap(context, quoteText, bodyWidth - 20) : []
    const columns = images.length > 1 ? 2 : 1
    const gap = 4
    const imageWidth = (bodyWidth - gap * (columns - 1)) / columns
    const imageHeight = images.length === 1
      ? Math.round(Math.min(440, imageWidth * images[0].height / images[0].width))
      : Math.min(160, Math.round(imageWidth * .8))
    const rows = Math.ceil(images.length / columns)
    const mediaY = bodyY + lines.length * lineHeight + 9
    const quoteY = mediaY + (rows ? rows * (imageHeight + gap) + 6 : 0)
    const quoteHeight = quoteLines.length ? 35 + quoteLines.length * quoteLineHeight : 0
    const hasActions = actions.some(action => action.icon || action.count)
    const actionY = Math.max(quoteY + quoteHeight + 8, top + avatarSize)
    const height = actionY + (hasActions ? 22 : 0) + 12
    canvas.width = width * dpr
    canvas.height = height * dpr
    context.scale(dpr, dpr)
    context.textBaseline = 'top'

    context.fillStyle = palette.background
    context.fillRect(0, 0, width, height)
    if (avatarImage) drawImage(context, avatarImage, padding, top, avatarSize, avatarSize, avatarSize / 2)
    else {
      context.fillStyle = palette.surface
      context.beginPath()
      context.arc(padding + avatarSize / 2, top + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
      context.fill()
    }
    const headerWidth = width - headerX - padding - 24
    context.font = font(nameSize, 700)
    const nameWidth = Math.min(context.measureText(name).width, detail ? headerWidth : headerWidth * .58)
    context.fillStyle = palette.text
    context.fillText(name, headerX, top + 1, nameWidth)
    if (verified) {
      context.fillStyle = '#168fda'
      drawGlyph(context, verified, headerX + nameWidth + 4, top + 1, nameSize)
    }
    const meta = [handle === 'i' ? '' : '@' + handle, time].filter(Boolean).join(' · ')
    const metaX = detail ? headerX : headerX + nameWidth + (verified ? nameSize + 9 : 6)
    context.font = font(metaSize)
    context.fillStyle = palette.meta
    if (meta) context.fillText(meta, metaX, detail ? top + Math.ceil(nameSize * 1.4) : top + 2,
      Math.max(1, headerWidth - (metaX - headerX)))
    drawGlyph(context, caret, width - padding - 17, top + 1, 17)

    context.fillStyle = palette.text
    context.font = font(bodySize)
    lines.forEach((line, index) => context.fillText(line, bodyX, bodyY + index * lineHeight))
    images.forEach((image, index) => drawImage(
      context, image,
      bodyX + (index % columns) * (imageWidth + gap),
      mediaY + Math.floor(index / columns) * (imageHeight + gap),
      imageWidth, imageHeight, 9,
    ))
    if (quoteLines.length) {
      context.fillStyle = palette.surface
      context.beginPath()
      context.roundRect(bodyX, quoteY, bodyWidth, quoteHeight, 8)
      context.fill()
      context.font = font(12 * fontScale, 600)
      context.fillStyle = palette.meta
      context.fillText('Quoted post', bodyX + 10, quoteY + 8)
      context.font = font(quoteSize)
      context.fillStyle = palette.text
      quoteLines.forEach((line, index) => context.fillText(line, bodyX + 10, quoteY + 27 + index * quoteLineHeight))
    }
    if (hasActions) {
      const actionWidth = bodyWidth / actions.length
      const iconSize = ios ? 16 : 17
      context.font = font(Math.min(13 * fontScale, 15))
      context.fillStyle = palette.meta
      actions.forEach(({ icon, count }, index) => {
        const x = bodyX + index * actionWidth
        drawGlyph(context, icon, x, actionY + 2, iconSize)
        const offset = icon ? iconSize + 4 : 0
        if (count) context.fillText(count, x + offset, actionY + 3, Math.max(1, actionWidth - offset - 2))
      })
    }
    for (const image of [avatarImage, ...images]) image?.close()
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not render post image')), 'image/png')
    })
  }

  function formattedCount(text) {
    const match = text.trim().match(/^([\d,.]+)([KMB])?$/i)
    if (!match) return undefined
    const multiplier = { K: 1000, M: 1000000, B: 1000000000 }[match[2]?.toUpperCase()] || 1
    return Math.round(Number(match[1].replaceAll(',', '')) * multiplier) || undefined
  }

  function domMedia(post) {
    if (!post) return []
    return ownElements(post, '[data-testid="tweetPhoto"] img, [data-testid="videoPlayer"] video[poster]')
      .map(element => element instanceof HTMLVideoElement
        ? { kind: 'video', url: element.poster, width: element.videoWidth || 1280, height: element.videoHeight || 720,
            duration: Number.isFinite(element.duration) ? element.duration : undefined }
        : { kind: 'image', url: element.currentSrc || element.src,
            width: element.naturalWidth || 600, height: element.naturalHeight || 400 })
  }

  async function xeetInput(post, id, handle, expanded, depth = 0) {
    const cached = postData.get(id)
    if (!post && !cached) return undefined
    const [heading, body, time, avatarElement, group] = post ? [
      ownElements(post, '[data-testid="User-Name"]')[0],
      ownElements(post, '[data-testid="tweetText"]')[0],
      ownElements(post, 'time')[0],
      ownElements(post, '[data-testid^="UserAvatar-Container"] img')[0],
      ownElements(post, '[role="group"]')[0],
    ] : []
    const author = cached?.author
    const name = author?.name || content(heading?.querySelector('a[href="/' + handle + '"]'))
    const verified = author?.verified ||
      (heading?.querySelector('[data-testid^="icon-verified"]') ? 'blue' : undefined)
    const quoted = depth < 2 && post && Array.from(post.querySelectorAll(postSelector))
      .find(element => element.parentElement.closest(postSelector) === post)
    const quotedLink = quoted && BetterX.postLink(quoted)
    const quoteId = cached?.quote ?? quotedLink?.pathname.split('/').at(-1)
    const quoteHandle = quotedLink?.pathname.split('/')[1]
    const recorded = time?.dateTime || cached?.createdAt
    const parsed = recorded && new Date(recorded)
    const createdAt = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined
    const counts = {}
    for (const [index, key] of ['replies', 'reposts', 'likes', 'views', 'bookmarks'].entries()) {
      const control = group?.querySelector(actionSelectors[index])
      const count = content(control?.querySelector('[data-testid="app-text-transition-container"]')) || content(control)
      counts[key] = cached?.counts?.[key] ?? formattedCount(count)
    }
    const source = cached?.media?.length ? cached.media : domMedia(post)
    const [avatar, badge, media, quote] = await Promise.all([
      encodeImage(author?.avatar || avatarElement?.src),
      encodeImage(author?.affiliate?.badge),
      Promise.all(source.slice(0, 4).map(async ({ url, ...item }) => ({ ...item, data: await encodeImage(url) }))),
      depth < 2 && (quoteId || quoted) ? xeetInput(quoted, quoteId, quoteHandle, false, depth + 1) : undefined,
    ])
    return {
      text: (expanded ? cached?.text || content(body) : content(body) || cached?.text || '').slice(0, 24000),
      author: {
        name: name || (handle === 'i' ? undefined : handle),
        handle: author?.handle || (handle === 'i' ? undefined : handle),
        verified,
        avatar,
        squareAvatar: verified === 'business',
        affiliate: badge ? { name: author.affiliate.name || '', badge } : undefined,
      },
      media,
      quote,
      counts,
      createdAt,
      now: new Date().toISOString(),
    }
  }

  async function renderPreferred(post, link) {
    const engine = await BetterX.xeet()
    if (!engine) return render(post, link)
    const { surface, width, dpr, theme, fontScale, expanded, autoExpand } = settings.imageExport
    const shouldExpand = expanded || (autoExpand && Boolean(ownElements(post, showMore).length))
    const [, handle] = link.pathname.split('/')
    const id = link.pathname.split('/').at(-1)
    const input = await xeetInput(post, id, handle, shouldExpand)
    const options = { surface, width, dpr, theme, fontScale, expanded: shouldExpand }
    await engine.fonts.ensure({ post: input, options })
    return new Blob([engine.xeet.renderPng(input, options)], { type: 'image/png' })
  }

  globalThis.BetterX.copyPostImage = (post, link) => navigator.clipboard.write([
    new ClipboardItem({ 'image/png': renderPreferred(post, link) }),
  ])
})()
