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
  function content(element) {
    if (!element) return ''
    const copy = element.cloneNode(true)
    for (const more of copy.querySelectorAll(showMore)) more.remove()
    for (const emoji of copy.querySelectorAll('img[alt]')) emoji.replaceWith(emoji.alt)
    for (const br of copy.querySelectorAll('br')) br.replaceWith('\n')
    return copy.textContent.trim()
  }

  async function imageBlob(source) {
    if (!source) return null
    const url = new URL(source, location.origin)
    if (url.protocol !== 'https:' || url.hostname !== mediaHost || url.username || url.password || url.port) return null
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

  async function encodeAvatar(source) {
    if (!source || !URL.canParse(source)) return undefined
    const sized = new URL(source)
    if (sized.pathname.startsWith('/profile_images/')) {
      sized.pathname = sized.pathname.replace(/_(?:normal|bigger|mini)(?=\.[^.]+$)/, '_200x200')
    }
    return (sized.href !== source && await encodeImage(sized.href)) || encodeImage(source)
  }

  function ownElements(post, selector) {
    return Array.from(post.querySelectorAll(selector)).filter(element => element.closest(postSelector) === post)
  }

  function formattedCount(text) {
    const match = text.trim().match(/^([\d,.]+)\s*([KMB])?(?:\s+views?)?$/i)
    if (!match) return undefined
    const multiplier = { K: 1000, M: 1000000, B: 1000000000 }[match[2]?.toUpperCase()] || 1
    return Math.round(Number(match[1].replaceAll(',', '')) * multiplier) || undefined
  }

  function postTime(id, ...timestamps) {
    const time = timestamps.find(value => value && Number.isFinite(Date.parse(value)))
    if (time) return new Date(time).toISOString()
    if (!/^\d{17,19}$/.test(id)) return undefined
    return new Date(Number(BigInt(id) >> 22n) + 1288834974657).toISOString()
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
    const badgeElement = heading?.querySelector('img[src*="pbs.twimg.com/profile_images/"], img[data-testid="affiliateBadge"], [data-testid="affiliateBadge"] img')
    const affiliate = author?.affiliate?.badge ? author.affiliate :
      badgeElement && { name: badgeElement.alt, badge: badgeElement.currentSrc || badgeElement.src }
    const quoted = depth < 2 && post && Array.from(post.querySelectorAll(postSelector))
      .find(element => element.parentElement.closest(postSelector) === post)
    const quotedLink = quoted && BetterX.postLink(quoted)
    const quoteId = cached?.quote ?? quotedLink?.pathname.split('/').at(-1)
    const quoteHandle = quotedLink?.pathname.split('/')[1]
    const createdAt = postTime(id, time?.dateTime, cached?.createdAt)
    const counts = {}
    for (const [index, key] of ['replies', 'reposts', 'likes', 'views', 'bookmarks'].entries()) {
      const control = group?.querySelector(actionSelectors[index])
      const count = content(control?.querySelector('[data-testid="app-text-transition-container"]')) || content(control)
      counts[key] = cached?.counts?.[key] ?? formattedCount(count)
    }
    if (counts.views === undefined && post) {
      const viewCount = ownElements(post, '[data-testid="viewCount"], a[href*="/analytics"]')[0]
      counts.views = formattedCount(content(viewCount))
    }
    const source = cached?.media?.length ? cached.media : domMedia(post)
    const [avatar, badge, media, quote] = await Promise.all([
      encodeAvatar(author?.avatar || avatarElement?.currentSrc || avatarElement?.src),
      encodeImage(affiliate?.badge),
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
        affiliate: badge ? { name: affiliate.name || '', badge } : undefined,
      },
      media,
      quote,
      counts,
      createdAt,
      now: new Date().toISOString(),
    }
  }

  function pageTheme(post) {
    for (let element = post; element; element = element.parentElement) {
      const color = getComputedStyle(element).backgroundColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/)
      if (color && Number(color[4] ?? 1) >= .5) {
        const [, red, green, blue] = color
        return .2126 * Number(red) + .7152 * Number(green) + .0722 * Number(blue) < 128 ? 'dark' : 'light'
      }
    }
    const scheme = getComputedStyle(document.documentElement).colorScheme
    if (scheme === 'dark' || scheme === 'light') return scheme
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  async function renderImage(post, link) {
    const { surface, width, dpr, theme, expanded, autoExpand } = settings.imageExport
    const shouldExpand = expanded || (autoExpand && Boolean(ownElements(post, showMore).length))
    const [, handle] = link.pathname.split('/')
    const id = link.pathname.split('/').at(-1)
    const input = await xeetInput(post, id, handle, shouldExpand)
    const options = { surface, width, dpr, theme: theme === 'auto' ? pageTheme(post) : theme, expanded: shouldExpand }
    const result = await chrome.runtime.sendMessage({ type: 'render-xeet', post: input, options })
    if (!result?.png) throw new Error(result?.error || 'Xeet could not render this post.')
    return new Blob([Uint8Array.from(atob(result.png), character => character.charCodeAt(0))], { type: 'image/png' })
  }

  globalThis.BetterX.copyPostImage = async (post, link) => {
    const png = renderImage(post, link)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
    } catch {
      await png
      throw new Error('Could not copy post image')
    }
  }
})()
