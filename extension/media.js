(() => {
  const limit = 2000
  const names = { photo: 'photo', video: 'video', gif: 'GIF' }
  const stills = /^\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//
  const imageFormats = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])
  const route = /^\/(?:i\/web|(\w+))\/status\/(\d+)(?:\/|$)/
  const viewer = /\/(?:photo|video)\/\d+$/
  const posts = new Map()
  const lookup = new Map()
  const menuSelector = '[role="menu"], [data-testid="Dropdown"], [data-testid="sheetDialog"], [data-testid$="ContextMenu" i]'
  const itemSelector = '[role="menuitem"], button, [role="button"], [tabindex="0"]'
  const photoActions = /^(?:copy (?:photo|image) (?:link|address)|post photo)$/i
  const videoActions = /^(?:copy (?:video|gif) (?:link|address)|copy link at current time|post (?:video|gif))$/i
  let active

  function mediaUrl(value) {
    try {
      const url = new URL(value)
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
      return url.hostname === 'pbs.twimg.com' || url.hostname === 'video.twimg.com' ? url : null
    } catch {
      return null
    }
  }

  function extensionOf(url, kind) {
    if (kind !== 'photo') return 'mp4'
    const format = url.searchParams.get('format') || url.pathname.match(/\.(\w{2,4})(?::\w+)?$/)?.[1]
    return imageFormats.has(format?.toLowerCase()) ? format.toLowerCase() : 'jpg'
  }

  function keysOf(value) {
    const url = mediaUrl(value)
    if (!url) return []
    const path = url.pathname.replace(/:\w+$/, '').replace(/\.\w+$/, '')
    const video = path.match(/^\/(?:ext_tw_video|amplify_video)(?:_thumb)?\/(\d+)\//)
    const gif = path.match(/^\/tweet_video(?:_thumb)?\/([^/]+)$/)
    return [path, video && `video/${video[1]}`, gif && `gif/${gif[1]}`].filter(Boolean)
  }

  function forget(postId) {
    for (const entry of posts.get(postId) || []) {
      for (const key of entry.keys) {
        if (lookup.get(key) === entry) lookup.delete(key)
      }
    }
    posts.delete(postId)
  }

  function remember(records) {
    for (const { postId, items } of records) {
      if (typeof postId !== 'string' || !/^\d+$/.test(postId) || !Array.isArray(items)) continue
      forget(postId)
      const entries = []
      for (const [index, item] of items.entries()) {
        const url = mediaUrl(item?.url)
        if (!url || !Object.hasOwn(names, item.kind)) continue
        const extension = extensionOf(url, item.kind)
        const keys = [...keysOf(item.url), ...keysOf(item.poster)]
        const entry = { postId, kind: item.kind, url: url.href, extension, index, total: items.length, keys }
        for (const key of keys) lookup.set(key, entry)
        entries.push(entry)
      }
      if (entries.length) posts.set(postId, entries)
    }
    while (posts.size > limit) forget(posts.keys().next().value)
  }

  function sourcesOf(el) {
    if (el.localName === 'video') return [el.poster, el.currentSrc || el.src]
    const source = el.localName === 'img' ? el.currentSrc || el.src : el.style?.backgroundImage.match(/^url\("(.+)"\)$/)?.[1]
    const url = mediaUrl(source)
    return url?.hostname === 'pbs.twimg.com' && stills.test(url.pathname) ? [source] : null
  }

  function layerOf(el) {
    return el.closest('article, [aria-modal="true"], #layers')
  }

  function locate(el) {
    const anchor = el.closest('a[href*="/status/"]')
    const viewing = el.closest('[aria-modal="true"]') && viewer.test(location.pathname)
    const paths = [
      anchor?.origin === location.origin && anchor.pathname,
      (viewing || el.closest('article')) && BetterX.postLink(el)?.pathname,
    ]
    for (const path of paths) {
      const found = path && path.match(route)
      if (found) return { author: found[1], id: found[2] }
    }
    return {}
  }

  function directMedia(sources, { id, author }) {
    if (!id) return null
    for (const source of sources) {
      const url = mediaUrl(source)
      if (!url) continue
      let kind
      if (url.hostname === 'pbs.twimg.com' && url.pathname.startsWith('/media/')) {
        kind = 'photo'
        url.pathname = url.pathname.replace(/:\w+$/, '')
        url.searchParams.set('name', 'orig')
      } else if (url.hostname === 'video.twimg.com' && url.pathname.endsWith('.mp4')) {
        kind = url.pathname.startsWith('/tweet_video/') ? 'gif' : 'video'
      } else {
        continue
      }
      const mediaId = url.pathname.split('/').at(-1).split('.')[0].replace(/[^\w-]/g, '').slice(0, 40)
      const filename = [author || 'x', id, mediaId].filter(Boolean).join('-') + '.' + extensionOf(url, kind)
      return { kind, url: url.href, filename }
    }
    return null
  }

  function resolve(el, sources) {
    const wanted = new Set(sources.flatMap(keysOf))
    const place = locate(el)
    const local = posts.get(place.id) || []
    let entry = local.find(entry => entry.keys.some(key => wanted.has(key)))
    for (const key of wanted) entry ||= lookup.get(key)
    if (!entry && !wanted.size && !el.closest('[role="link"]:not(a)')) {
      const clips = local.filter(entry => entry.kind !== 'photo')
      if (clips.length === 1) [entry] = clips
    }
    if (!entry) return directMedia(sources, place)
    const author = place.id === entry.postId && place.author !== 'i' && place.author
    const name = ['x', author, entry.postId, entry.total > 1 && entry.index + 1].filter(Boolean).join('-')
    return { kind: entry.kind, url: entry.url, filename: `${name}.${entry.extension}` }
  }

  function find(event) {
    const layer = layerOf(event.target)
    if (!layer) return null
    for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
      const sources = sourcesOf(el)
      const media = sources && layerOf(el) === layer && resolve(el, sources)
      if (media) return media
    }
    return null
  }

  function visible(element) {
    return element.checkVisibility({ checkVisibilityCSS: true }) && !element.closest('[aria-hidden="true"]')
  }

  function clear() {
    if (!active) return
    active.observer.disconnect()
    clearTimeout(active.timer)
    active.button?.remove()
    active = null
  }

  async function download({ kind, url, filename }) {
    if (!BetterX.settings.downloads) return
    let reply
    try {
      reply = await chrome.runtime.sendMessage({ type: 'download', url, filename })
    } catch {}
    if (!reply?.ok) BetterX.notice(reply?.error || `Could not download ${names[kind]}`)
  }

  function appendDownload(menu, actions, request) {
    const last = actions.reduce((bottom, item) =>
      item.getBoundingClientRect().bottom >= bottom.getBoundingClientRect().bottom ? item : bottom)
    let row = last
    while (row.parentElement !== menu && !actions.some(action => action !== last && row.parentElement.contains(action))) {
      row = row.parentElement
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.className = 'better-x-media-download'
    button.textContent = `Download ${names[request.media.kind]}`
    const label = Array.from(last.querySelectorAll('span, [dir]')).findLast(element => element.textContent.trim()) || last
    const style = getComputedStyle(label)
    button.style.font = `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`
    button.style.color = style.color
    button.style.minHeight = `${last.getBoundingClientRect().height}px`
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
    })
    button.addEventListener('click', async event => {
      event.stopPropagation()
      if (!event.isTrusted || active !== request || button.hasAttribute('aria-busy')) return
      button.setAttribute('aria-busy', 'true')
      try {
        await download(request.media)
      } finally {
        button.removeAttribute('aria-busy')
      }
    })
    if (getComputedStyle(row.parentElement).flexDirection === 'column-reverse') row.before(button)
    else row.after(button)
    Object.assign(request, { menu, button, last })
    clearTimeout(request.timer)
  }

  function scan(request) {
    if (active !== request) return
    if (request.menu && (!request.menu.isConnected || (request.last.isConnected && !visible(request.last)))) {
      clear()
      return
    }
    if (request.button?.isConnected && request.last.isConnected) return
    request.button?.remove()

    const labels = request.media.kind === 'photo' ? photoActions : videoActions
    for (const menu of document.querySelectorAll(menuSelector)) {
      if (request.previous.has(menu)) continue
      const actions = [...new Set(Array.from(menu.querySelectorAll(itemSelector))
        .filter(item => labels.test(item.textContent.trim().replace(/\s+/g, ' ')) && visible(item))
        .map(item => item.closest('[role="menuitem"]') || item))]
        .filter(item => menu.contains(item))
      if (!actions.length) continue
      appendDownload(menu, actions, request)
      break
    }
  }

  document.addEventListener('better-x:media', event => {
    try {
      remember(JSON.parse(event.detail))
    } catch {}
  })

  addEventListener('contextmenu', event => {
    const reused = active?.menu
    clear()
    if (!event.isTrusted || !BetterX.settings.downloads || event.shiftKey || !(event.target instanceof Element)) return
    const media = find(event)
    if (!media) return

    const previous = new Set(Array.from(document.querySelectorAll(menuSelector))
      .filter(menu => menu !== reused && visible(menu)))
    const observer = new MutationObserver(() => scan(request))
    const request = { media, previous, observer, timer: setTimeout(clear, 1500) }
    active = request
    setTimeout(() => {
      if (active !== request) return
      if (!event.defaultPrevented) {
        clear()
        return
      }
      observer.observe(document, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'class', 'aria-hidden'],
      })
      scan(request)
    }, 0)
  }, true)

  document.addEventListener('pointerdown', event => {
    if (event.button !== 2 && !active?.menu?.contains(event.target)) clear()
  }, true)

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') clear()
  }, true)

  chrome.storage.onChanged.addListener(() => {
    if (!BetterX.settings.downloads) clear()
  })
})()
