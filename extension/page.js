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

  function enabled(attribute, fallback) {
    const value = document.documentElement?.getAttribute(attribute)
    if (value === 'true') return true
    if (value === 'false') return false
    return fallback
  }

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
    if (!node || typeof node !== 'object') return
    visit(node)
    for (const value of Object.values(node)) walk(value, visit)
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
    const playable = variants.filter(variant => variant?.content_type === 'video/mp4' && mediaUrl(variant.url))
    playable.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))
    return playable.length ? mediaUrl(playable[0].url) : null
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

  function filterData(operation, data) {
    const ads = enabled(adsAttribute, true) &&
      (ageOperations.has(operation) || /(?:Timeline|Tweets|Media)$/.test(operation))
    const age = enabled(ageAttribute, false) && ageOperations.has(operation)
    const records = new Map()
    let changed = false
    walk(data, node => {
      if (ads && pruneInstructions(node)) changed = true
      if (age && clearAgePrompt(node)) changed = true
      collectMedia(node, records)
    })
    announceMedia(records)
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

  const xhrBodies = new WeakMap()
  const xhrTypes = new Set(['', 'text', 'json'])

  function patchXhrGetter(name) {
    const native = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, name)
    Object.defineProperty(XMLHttpRequest.prototype, name, {
      ...native,
      get() {
        const body = native.get.call(this)
        if (this.readyState !== XMLHttpRequest.DONE || !xhrTypes.has(this.responseType)) return body
        const operation = graphqlOperation(this.responseURL)
        if (!operation) return body
        const cached = xhrBodies.get(this)
        if (cached?.url === this.responseURL && cached.raw === body) return cached.filtered
        const filtered = filterBody(operation, body)
        xhrBodies.set(this, { url: this.responseURL, raw: body, filtered })
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
