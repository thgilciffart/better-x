(() => {
  const limit = 2000
  const names = { photo: 'photo', video: 'video', gif: 'GIF' }
  const stills = /^\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//
  const imageFormats = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])
  const route = /^\/(?:i\/web|(\w+))\/status\/(\d+)(?:\/|$)/
  const viewer = /\/(?:photo|video)\/\d+$/
  const posts = new Map()
  const lookup = new Map()
  let menu
  let label
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

  function build() {
    const ns = 'http://www.w3.org/2000/svg'
    const icon = document.createElementNS(ns, 'svg')
    const path = document.createElementNS(ns, 'path')
    const button = document.createElement('button')
    menu = document.createElement('div')
    label = document.createElement('span')
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('aria-hidden', 'true')
    path.setAttribute('d', 'M12 4v11m-5-4 5 5 5-5M5 20h14')
    icon.append(path)
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.append(icon, label)
    button.addEventListener('click', event => {
      if (event.isTrusted) download()
    })
    menu.className = 'better-x-media-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', 'Better X')
    menu.append(button)
  }

  function close() {
    if (!active) return
    const { controller, origin } = active
    const focused = menu.contains(document.activeElement)
    active = null
    controller.abort()
    menu.remove()
    if (focused && origin?.isConnected) origin.focus({ preventScroll: true })
  }

  async function download() {
    if (!active) return
    const { kind, url, filename } = active.media
    close()
    if (!BetterX.settings.downloads) return
    let reply
    try {
      reply = await chrome.runtime.sendMessage({ type: 'download', url, filename })
    } catch {}
    if (!reply?.ok) BetterX.notice(reply?.error || `Could not download ${names[kind]}`)
  }

  function dismiss(event) {
    if (!menu.contains(event.target)) close()
  }

  function press(event) {
    if (!event.isTrusted) return
    const { key } = event
    if (key === 'Enter' || key === ' ') download()
    else if (key === 'Escape') close()
    else if (!/^(?:Arrow|Home|End|Page)/.test(key)) {
      if (!/^(?:Shift|Control|Alt|Meta)$/.test(key)) close()
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function open(event, media) {
    if (!menu) build()
    label.textContent = `Download ${names[media.kind]}`
    document.documentElement.append(menu)
    const { clientWidth, clientHeight } = document.documentElement
    menu.style.left = `${Math.max(8, Math.min(event.clientX, clientWidth - menu.offsetWidth - 8))}px`
    menu.style.top = `${Math.max(8, Math.min(event.clientY, clientHeight - menu.offsetHeight - 8))}px`
    const controller = new AbortController()
    const options = { capture: true, signal: controller.signal }
    active = { media, controller, origin: document.activeElement }
    addEventListener('pointerdown', dismiss, options)
    addEventListener('scroll', dismiss, options)
    addEventListener('resize', close, options)
    addEventListener('blur', event => { if (event.target === window) close() }, options)
    addEventListener('keydown', press, options)
    menu.firstChild.focus({ preventScroll: true })
  }

  document.addEventListener('better-x:media', event => {
    try {
      remember(JSON.parse(event.detail))
    } catch {}
  })

  addEventListener('contextmenu', event => {
    if (menu?.contains(event.target)) {
      event.preventDefault()
      return
    }
    close()
    if (!event.isTrusted || !BetterX.settings.downloads || event.shiftKey || !(event.target instanceof Element)) return
    const media = find(event)
    if (!media) return
    event.preventDefault()
    event.stopImmediatePropagation()
    open(event, media)
  }, true)
})()
