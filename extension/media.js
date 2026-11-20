(() => {
  const limit = 2000
  const names = { photo: 'photo', video: 'video', gif: 'GIF' }
  const stills = /^\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\//
  const imageFormats = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])
  const route = /^\/(?:i\/web|(\w+))\/status\/(\d+)(?:\/|$)/
  const viewer = /\/(?:photo|video)\/\d+$/
  const posts = new Map()
  const lookup = new Map()
  const menuSelector = '[role="menu"], [data-testid="Dropdown"], [data-testid="sheetDialog"], [data-testid$="ContextMenu" i], [data-slot$="context-menu-content"], [data-slot="xds-menu-popup"]'
  const itemSelector = '[role="menuitem"], button, [role="button"], [tabindex="0"]'
  const photoActions = /^(?:copy (?:photo|image) (?:link|address)|post photo)$/i
  const videoActions = /^(?:copy (?:video|gif) (?:link|address)|copy link at current time|post (?:video|gif))$/i
  const replaced = /^(?:copy photo link|copy (?:video|gif) address)$/i
  const hidden = 'data-better-x-hidden'
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
    return el.closest('article, [role="dialog"], [aria-modal="true"], #layers')
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

  function directMedia(sources, { id, author }, video) {
    for (const source of sources) {
      const url = mediaUrl(source)
      if (!url) continue
      let kind
      if (!video && url.hostname === 'pbs.twimg.com' && url.pathname.startsWith('/media/')) {
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
    const video = el instanceof HTMLVideoElement
    const compatible = entry => entry && (!video || entry.kind !== 'photo')
    let entry = local.find(entry => compatible(entry) && entry.keys.some(key => wanted.has(key)))
    for (const key of wanted) {
      const match = lookup.get(key)
      if (compatible(match)) entry ||= match
    }
    if (!entry && !wanted.size && !el.closest('[role="link"]:not(a)')) {
      const clips = local.filter(entry => entry.kind !== 'photo')
      if (clips.length === 1) [entry] = clips
    }
    if (!entry) return directMedia(sources, place, video)
    return named(entry, place.id === entry.postId && place.author !== 'i' && place.author)
  }

  function named(entry, author) {
    const name = ['x', author, entry.postId, entry.total > 1 && entry.index + 1].filter(Boolean).join('-')
    return { kind: entry.kind, url: entry.url, filename: `${name}.${entry.extension}` }
  }

  function find(event) {
    const layer = layerOf(event.target)
    if (!layer) return null
    const player = event.target.closest('[data-testid="videoPlayer"], [data-slot="xds-context-menu-trigger"]')
    let video = player?.querySelector('video') || event.target.closest('video')
    for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
      if (layerOf(el) !== layer) continue
      if (!video && el instanceof HTMLVideoElement) video = el
      const sources = sourcesOf(el)
      const media = sources && resolve(el, sources)
      if (media && (!video || media.kind !== 'photo')) {
        const address = media.kind === 'photo' ? sources.find(source => mediaUrl(source)?.pathname.startsWith('/media/')) : media.url
        return { ...media, address: address || media.url, video }
      }
    }
    if (!video) return null
    const media = resolve(video, sourcesOf(video))
    return { kind: 'video', ...media, video }
  }

  function visible(element) {
    return element.checkVisibility({ checkVisibilityCSS: true }) && !element.closest('[aria-hidden="true"]')
  }

  function clear() {
    if (!active) return
    active.observer.disconnect()
    clearTimeout(active.timer)
    active.addons?.remove()
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

  function png(source, width, height) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(source, 0, 0)
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png')
    })
  }

  async function photoPng(url) {
    const response = await fetch(url, {
      credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) throw new Error('Image unavailable')
    const bitmap = await createImageBitmap(await response.blob())
    try {
      return await png(bitmap, bitmap.width, bitmap.height)
    } finally {
      bitmap.close()
    }
  }

  function waitForVideo(video, event, signal) {
    return new Promise((resolve, reject) => {
      const options = { once: true, signal }
      video.addEventListener(event, resolve, options)
      video.addEventListener('error', () => reject(new Error('Video unavailable')), options)
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }

  async function videoPng({ video, url }) {
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
      throw new Error('Video frame unavailable')
    }
    const time = video.currentTime
    try {
      return await png(video, video.videoWidth, video.videoHeight)
    } catch (error) {
      if (error.name !== 'SecurityError' || !url) throw error
    }
    const decoder = document.createElement('video')
    decoder.crossOrigin = 'anonymous'
    decoder.preload = 'auto'
    const signal = AbortSignal.timeout(8000)
    try {
      const ready = waitForVideo(decoder, 'loadeddata', signal)
      decoder.src = url
      await ready
      const target = Math.min(time, Math.max(0, decoder.duration - .001))
      if (target > 0) {
        const seeked = waitForVideo(decoder, 'seeked', signal)
        decoder.currentTime = target
        await seeked
      }
      return await png(decoder, decoder.videoWidth, decoder.videoHeight)
    } finally {
      decoder.removeAttribute('src')
      decoder.load()
    }
  }

  function copyPng(bytes) {
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': bytes })])
  }

  function mediaActions(media) {
    const actions = []
    if (media.kind === 'photo') {
      actions.push(
        ['Copy image', () => copyPng(photoPng(media.url)), 'Copied image'],
        ['Copy image address', () => navigator.clipboard.writeText(media.address), 'Copied image address'],
        ['Open image in new tab', () => window.open(media.address, '_blank', 'noopener,noreferrer')],
      )
    } else {
      if (media.url) actions.push([`Copy ${names[media.kind]} address`, () => navigator.clipboard.writeText(media.url), `Copied ${names[media.kind]} address`])
      if (media.video) actions.push(['Copy video frame', () => copyPng(videoPng(media)), 'Copied video frame'])
      if (media.url) actions.push(['Open video in new tab', () => window.open(media.url, '_blank', 'noopener,noreferrer')])
    }
    if (media.url) actions.push([`Download ${names[media.kind]}`, () => download(media)])
    return actions
  }

  function text(item) {
    return item.textContent.trim().replace(/\s+/g, ' ')
  }

  function lastItem(items) {
    return items.reduce((bottom, item) =>
      item.getBoundingClientRect().bottom >= bottom.getBoundingClientRect().bottom ? item : bottom)
  }

  function placeActions(menu, items, last, addons) {
    let row = last
    while (row.parentElement !== menu && !items.some(item => item !== last && row.parentElement.contains(item))) {
      row = row.parentElement
    }
    const reverse = getComputedStyle(row.parentElement).flexDirection === 'column-reverse'
    if (reverse && row.previousElementSibling !== addons) row.before(addons)
    if (!reverse && row.nextElementSibling !== addons) row.after(addons)
  }

  function appendActions(items, request) {
    const shown = items.filter(item => !item.hasAttribute(hidden))
    const last = lastItem(shown.length ? shown : items)
    const label = Array.from(last.querySelectorAll('span, [dir]')).findLast(element => element.textContent.trim()) || last
    const style = getComputedStyle(label)
    const addons = document.createElement('div')
    addons.className = 'better-x-media-actions'
    addons.setAttribute('role', 'presentation')
    const native = new Set(items.filter(item => !replaced.test(text(item))).map(item => text(item).toLowerCase()))
    for (const [title, run, success] of mediaActions(request.media)) {
      if (native.has(title.toLowerCase())) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.className = 'better-x-media-action'
      button.textContent = title
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
          await run()
          if (success) BetterX.notice(success)
        } catch {
          BetterX.notice(title === 'Copy video frame' ? 'Could not copy the frame. Play the video and try again.' : `Could not ${title.toLowerCase()}`)
        } finally {
          button.removeAttribute('aria-busy')
        }
      })
      addons.append(button)
    }
    request.addons = addons
    clearTimeout(request.timer)
  }

  function scan(request) {
    if (active !== request) return
    if (request.menu && (!request.menu.isConnected || (request.last.isConnected && !visible(request.last)))) {
      clear()
      return
    }
    const mounted = request.addons?.isConnected
    if (!mounted) request.addons?.remove()

    const labels = request.media.kind === 'photo' ? photoActions : videoActions
    const menus = mounted ? [request.menu] : document.querySelectorAll(menuSelector)
    for (const menu of menus) {
      if (request.previous.has(menu)) continue
      const items = [...new Set(Array.from(menu.querySelectorAll(itemSelector), item => item.closest('[role="menuitem"]') || item))]
        .filter(item => menu.contains(item) && !request.addons?.contains(item) && (item.hasAttribute(hidden) || visible(item)))
      if (!items.some(item => labels.test(text(item)))) continue
      if (!mounted) appendActions(items, request)
      for (const item of items) if (request.media.url && replaced.test(text(item))) item.setAttribute(hidden, '')
      const shown = items.filter(item => !item.hasAttribute(hidden))
      Object.assign(request, { menu, last: shown.length ? lastItem(shown) : menu })
      placeActions(menu, items, lastItem(items), request.addons)
      break
    }
  }

  BetterX.downloadVideo = link => {
    const [, author, id] = link.pathname.match(route) || []
    const entry = posts.get(id)?.find(entry => entry.kind !== 'photo')
    return entry ? download(named(entry, author !== 'i' && author)) : BetterX.notice('Could not find this video')
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
      observer.observe(document, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'class', 'aria-hidden', 'data-state'],
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
