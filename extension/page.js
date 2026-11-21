(() => {
  const adsAttribute = 'data-better-x-ads'
  const ageAttribute = 'data-better-x-age-warning'
  const ageToken = 'AgeVerificationPrompt'
  const ageOperations = new Set([
    'UserOriginalsTimeline',
    'UserRepliesTimeline',
    'UserRepostsTimeline',
    'UserVideoTimeline',
    'UserPhotoTimeline',
    'UserHighlightsTweets',
    'TweetDetail',
    'TweetResultByRestId',
    'UserTweets',
    'UserTweetsAndReplies',
    'HomeTimeline',
    'HomeLatestTimeline',
    'SearchTimeline',
    'UserMedia',
    'Bookmarks',
    'BookmarkSearchTimeline',
    'Likes',
  ])
  const promotedEntryId = /^promoted(?:-tweet|Tweet)-/
  const promotedKeys = ['promotedMetadata', 'promoted_metadata']
  const entryLists = ['entries', 'moduleItems']
  const mediaKinds = { photo: 'photo', video: 'video', animated_gif: 'gif' }
  const { cleanCopiedLink: rewriteLink } = BetterXLinks

  function enabled(attribute, fallback) {
    const value = document.documentElement?.getAttribute(attribute)
    if (value === 'true') return true
    if (value === 'false') return false
    return fallback
  }

  function cleanCopiedLink(text) {
    const host = document.documentElement?.getAttribute('data-better-x-link-host') || 'x.com'
    return rewriteLink(text, host, enabled('data-better-x-clean-links', true))
  }

  const writeText = globalThis.Clipboard?.prototype.writeText
  if (writeText) {
    Clipboard.prototype.writeText = function (text) {
      return Reflect.apply(writeText, this, [cleanCopiedLink(text)])
    }
  }

  window.addEventListener('copy', event => {
    const text = String(document.getSelection())
    const cleaned = cleanCopiedLink(text)
    if (cleaned === text || !event.clipboardData) return
    event.clipboardData.setData('text/plain', cleaned)
    event.preventDefault()
  }, true)

  function graphqlOperation(value) {
    if (!value) return null
    try {
      const url = new URL(value, location.href)
      if (!/(^|\.)(x|twitter)\.com$/.test(url.hostname)) return null
      return url.pathname.match(/\/graphql\/[\w-]+\/(\w+)$/)?.[1] ?? null
    } catch {
      return null
    }
  }

  function walk(node, visit) {
    visit(node)
    for (const key of Object.keys(node)) {
      const value = node[key]
      if (value && typeof value === 'object') walk(value, visit)
    }
  }

  function isPromoted(entry) {
    if (promotedEntryId.test(entry?.entryId ?? '')) return true
    const contents = [entry?.content?.itemContent, entry?.content?.content, entry?.item?.itemContent, entry?.item?.content]
    return contents.some(content => promotedKeys.some(key => content?.[key]))
  }

  function prunePromoted(list) {
    let removed = 0
    for (let index = list.length - 1; index >= 0; index--) {
      const items = list[index]?.content?.items
      const nested = Array.isArray(items) && items.length ? prunePromoted(items) : 0
      removed += nested
      if (isPromoted(list[index]) || (nested && !items.length)) {
        list.splice(index, 1)
        removed++
      }
    }
    return removed
  }

  function pruneInstructions(node) {
    if (!Array.isArray(node.instructions)) return 0
    let removed = 0
    for (const instruction of node.instructions) {
      for (const key of entryLists) {
        if (Array.isArray(instruction?.[key])) removed += prunePromoted(instruction[key])
      }
    }
    return removed
  }

  function clearAgePrompt(node) {
    let cleared = false
    for (const key of ['interstitial_action', 'interstitialAction', '__typename', 'type', 'itemType', 'entryType', 'contentType']) {
      if (node[key] !== ageToken) continue
      node[key] = ''
      cleared = true
    }
    return cleared
  }

  function mediaUrl(value) {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && url.hostname.endsWith('.twimg.com') ? url : null
    } catch {
      return null
    }
  }

  function bestMp4(variants) {
    if (!Array.isArray(variants)) return null
    let best = null
    let bestBitrate = -Infinity
    for (const variant of variants) {
      if (variant?.content_type !== 'video/mp4') continue
      const bitrate = Number(variant.bitrate) || 0
      if (best && bitrate <= bestBitrate) continue
      const candidate = mediaUrl(variant.url)
      if (!candidate) continue
      best = candidate
      bestBitrate = bitrate
    }
    return best
  }

  function mediaItem(media) {
    const kind = mediaKinds[media?.type]
    if (!kind) return null
    if (kind === 'photo') {
      const url = mediaUrl(media.media_url_https)
      if (!url) return null
      url.searchParams.set('name', 'orig')
      return { kind, url: url.href, poster: '' }
    }
    const url = bestMp4(media.video_info?.variants)
    if (!url) return null
    return { kind, url: url.href, poster: mediaUrl(media.media_url_https)?.href ?? '' }
  }

  function collectMedia(node, records) {
    const legacy = node.legacy ?? node
    const media = legacy.extended_entities?.media
    const postId = node.rest_id ?? legacy.id_str
    if (!Array.isArray(media) || typeof postId !== 'string' || !/^\d+$/.test(postId) || records.has(postId)) return
    const items = media.map(entry => mediaItem(entry)).filter(Boolean)
    if (items.length) records.set(postId, items)
  }

  function announceMedia(records) {
    if (!records.size) return
    const detail = JSON.stringify([...records].map(([postId, items]) => ({ postId, items })))
    document.dispatchEvent(new CustomEvent('better-x:media', { detail }))
  }

  function collectPost(node, posts) {
    const id = node.rest_id
    const legacy = node.legacy
    const fullText = node.note_tweet?.note_tweet_results?.result?.text || legacy?.full_text
    if (typeof id !== 'string' || !/^\d+$/.test(id) || typeof fullText !== 'string') return
    const user = node.core?.user_results?.result
    const affiliate = user?.affiliates_highlighted_label?.label
    const verification = user?.verification?.verified_type ?? user?.legacy?.verified_type
    const quote = node.quoted_status_result?.result
    const items = Array.isArray(legacy?.extended_entities?.media) ? legacy.extended_entities.media : []
    const media = items.flatMap(item => {
      if (!item) return []
      const kind = { photo: 'image', video: 'video', animated_gif: 'gif' }[item.type]
      const width = item.original_info?.width ?? item.sizes?.large?.w
      const height = item.original_info?.height ?? item.sizes?.large?.h
      const url = mediaUrl(item.media_url_https)
      if (!kind || !url || !width || !height) return []
      return [{ kind, width, height, url: url.href, duration: item.video_info?.duration_millis / 1000 || undefined }]
    })
    posts.set(id, {
      text: items.reduce((value, item) => item?.url && value.endsWith(item.url)
        ? value.slice(0, -item.url.length).trimEnd() : value, fullText).slice(0, 24000),
      media,
      quote: quote?.tweet?.rest_id ?? quote?.rest_id ?? legacy?.quoted_status_id_str,
      createdAt: legacy?.created_at,
      lang: legacy?.lang,
      author: user && {
        name: user.core?.name ?? user.legacy?.name,
        handle: user.core?.screen_name ?? user.legacy?.screen_name,
        avatar: user.avatar?.image_url ?? user.legacy?.profile_image_url_https,
        verified: verification === 'Business' ? 'business' : verification === 'Government' ? 'government' :
          user.is_blue_verified || user.legacy?.verified ? 'blue' : undefined,
        affiliate: affiliate && { name: affiliate.description, badge: affiliate.badge?.url },
      },
      counts: {
        replies: legacy?.reply_count, reposts: legacy?.retweet_count, likes: legacy?.favorite_count,
        bookmarks: legacy?.bookmark_count, views: Number(node.views?.count) || undefined,
      },
    })
  }

  function filterData(operation, data) {
    const ads = enabled(adsAttribute, true) &&
      (ageOperations.has(operation) || /(?:Timeline|Tweets|Media)$/.test(operation))
    const age = enabled(ageAttribute, false) && ageOperations.has(operation)
    const records = new Map()
    const posts = new Map()
    let changed = false
    if (!data || typeof data !== 'object') return false
    walk(data, node => {
      if (ads && node.instructions && pruneInstructions(node)) changed = true
      if (age && clearAgePrompt(node)) changed = true
      if (node.legacy || node.extended_entities) collectMedia(node, records)
      if (node.rest_id) collectPost(node, posts)
    })
    announceMedia(records)
    if (posts.size) {
      document.dispatchEvent(new CustomEvent('better-x:post-data', { detail: JSON.stringify([...posts]) }))
    }
    return changed
  }

  function filterBody(operation, body) {
    if (typeof body === 'string') {
      try {
        const data = JSON.parse(body)
        return filterData(operation, data) ? JSON.stringify(data) : body
      } catch {
        return body
      }
    }
    if (body && typeof body === 'object') filterData(operation, body)
    return body
  }

  const nativeCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
  const nightModes = { dark: '2', light: '0' }

  function forcedNightMode() {
    return nightModes[document.documentElement?.getAttribute('data-better-x-quiet-theme')]
  }

  Object.defineProperty(Document.prototype, 'cookie', {
    ...nativeCookie,
    get() {
      const value = nativeCookie.get.call(this)
      const mode = forcedNightMode()
      if (!mode) return value
      return [...value.split('; ').filter(part => part && !part.startsWith('night_mode=')), `night_mode=${mode}`].join('; ')
    },
    set(value) {
      if (forcedNightMode() && /^\s*night_mode=/.test(value)) return
      nativeCookie.set.call(this, value)
    },
  })

  const xhrBodies = new WeakMap()
  const xhrTypes = new Set(['', 'text', 'json'])

  function patchXhrGetter(name) {
    const native = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, name)
    Object.defineProperty(XMLHttpRequest.prototype, name, {
      ...native,
      get() {
        const body = native.get.call(this)
        if (this.readyState !== XMLHttpRequest.DONE || !xhrTypes.has(this.responseType)) return body
        const url = this.responseURL
        const cached = xhrBodies.get(this)
        if (cached?.url === url && cached.raw === body) return cached.filtered
        const operation = graphqlOperation(url)
        if (!operation) return body
        const filtered = filterBody(operation, body)
        xhrBodies.set(this, { url, raw: body, filtered })
        return filtered
      },
    })
  }

  patchXhrGetter('response')
  patchXhrGetter('responseText')

  const nativeFetch = window.fetch

  window.fetch = async function fetch(...args) {
    const response = await Reflect.apply(nativeFetch, this, args)
    const operation = graphqlOperation(response.url)
    if (!operation) return response
    const text = await response.clone().text().catch(() => null)
    if (text === null) return response
    const filtered = filterBody(operation, text)
    if (filtered === text) return response
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')
    const replacement = new Response(filtered, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
    Object.defineProperties(replacement, {
      url: { value: response.url },
      redirected: { value: response.redirected },
      type: { value: response.type },
    })
    return replacement
  }
})()
