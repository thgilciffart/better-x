(() => {
  const { postSelector, settings } = BetterX
  const postData = new Map()
  const postId = Symbol('postId')
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
      [postId]: id,
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

  const translateHost = 'https://translate.googleapis.com/translate_a/t'
  const grokHost = 'https://api.x.com/2/grok/translation.json'
  const webBearer = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'
  const keepAsWritten = /(https?:\/\/\S+|@\w{1,15}|#[\p{L}\p{N}_]+|\$[\p{L}\p{N}_]+|[\w.+-]+@[\w-]+\.[\w.]+|\r?\n)/gu

  function csrfToken() {
    return document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)?.[1]
  }

  function grokText(body) {
    let text = ''
    for (const line of body.split('\n')) {
      if (!line.trim()) continue
      try {
        const chunk = JSON.parse(line)?.result?.text
        if (typeof chunk === 'string') text += chunk
      } catch {}
    }
    return text.trim()
  }

  async function grokTranslation(id, language) {
    const token = csrfToken()
    if (!token || !/^\d+$/.test(id ?? '')) return null
    const response = await fetch(grokHost, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', authorization: webBearer, 'x-csrf-token': token },
      body: JSON.stringify({ content_type: 'POST', id, dst_lang: language, include_polls: true }),
    })
    if (!response.ok) return null
    return grokText(await response.text()) || null
  }

  const scriptLanguages = [
    [/[\u3040-\u30ff]/, 'ja'], [/[\uac00-\ud7af\u1100-\u11ff]/, 'ko'], [/[\u4e00-\u9fff]/, 'zh'],
    [/[\u0600-\u06ff]/, 'ar'], [/[\u0590-\u05ff]/, 'he'], [/[\u0400-\u04ff]/, 'ru'],
    [/[\u0e00-\u0e7f]/, 'th'], [/[\u0900-\u097f]/, 'hi'], [/[\u0370-\u03ff]/, 'el'],
  ]

  function guessLanguage(text) {
    return scriptLanguages.find(([pattern]) => pattern.test(text))?.[1] ?? ''
  }

  function sameLanguage(source, language) {
    if (!source || !language) return false
    return source.toLowerCase().split('-')[0] === language.toLowerCase().split('-')[0]
  }

  async function translateMany(texts, language) {
    const translated = []
    let detected = ''
    for (let start = 0; start < texts.length; start += 24) {
      const query = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: language })
      for (const text of texts.slice(start, start + 24)) query.append('q', text)
      const response = await fetch(translateHost + '?' + query)
      if (!response.ok) throw new Error('Translation is unavailable')
      const body = await response.json()
      if (!Array.isArray(body) || body.length !== Math.min(24, texts.length - start)) {
        throw new Error('Translation returned an unexpected result')
      }
      for (const entry of body) {
        if (!Array.isArray(entry)) continue
        if (!detected && typeof entry[1] === 'string') detected = entry[1]
        translated.push(String(entry[0]))
      }
    }
    return { translated, detected }
  }

  async function translate(text, language) {
    const parts = []
    let last = 0
    for (const match of text.matchAll(keepAsWritten)) {
      parts.push({ text: text.slice(last, match.index), prose: true })
      parts.push({ text: match[0], prose: false })
      last = match.index + match[0].length
    }
    parts.push({ text: text.slice(last), prose: true })
    const pending = []
    for (const part of parts) {
      if (!part.prose) continue
      const [, lead, core, trail] = part.text.match(/^(\s*)([\s\S]*?)(\s*)$/)
      part.lead = lead
      part.trail = trail
      part.text = core
      if (core) pending.push(part)
    }
    if (!pending.length) return { text, language: '' }
    const { translated, detected } = await translateMany(pending.map(part => part.text), language)
    pending.forEach((part, index) => { part.text = translated[index] })
    return { text: parts.map(part => (part.lead ?? '') + part.text + (part.trail ?? '')).join(''), language: detected }
  }

  async function translatePost(input, language) {
    if (!input || typeof input.text !== 'string' || !input.text.trim()) return { input }
    const id = input[postId]
    const source = postData.get(id)?.lang
    if (sameLanguage(source, language)) return { input }
    const grok = await grokTranslation(id, language).catch(() => null)
    if (grok) return { input: { ...input, text: grok }, badge: { provider: 'x', language: source || guessLanguage(input.text) } }
    const google = await translate(input.text, language).catch(() => null)
    if (google?.text) {
      return { input: { ...input, text: google.text }, badge: { provider: 'google', language: google.language || source || guessLanguage(input.text) } }
    }
    return { input }
  }

  async function localized(input, language) {
    if (!language) return { input }
    const main = await translatePost(input, language)
    const quote = await translatePost(main.input.quote, language)
    return { input: { ...main.input, quote: quote.input }, badge: main.badge }
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
    const { surface, width, dpr, theme, expanded, autoExpand, language } = settings.imageExport
    const shouldExpand = expanded || (autoExpand && Boolean(ownElements(post, showMore).length))
    const [, handle] = link.pathname.split('/')
    const id = link.pathname.split('/').at(-1)
    const { input, badge } = await localized(await xeetInput(post, id, handle, shouldExpand), language)
    const options = { surface, width, dpr, theme: theme === 'auto' ? pageTheme(post) : theme, expanded: shouldExpand }
    const result = await chrome.runtime.sendMessage({ type: 'render-xeet', post: input, options, badge })
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
