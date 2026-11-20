(() => {
  const { settings, notice, postLink, postSelector, copyPostImage, downloadVideo, closeMenu, menuChanged } = BetterX
  const menuSelector = '[role="menu"], [data-testid="Dropdown"], [data-testid="sheetDialog"]'
  const shareSelector = '[data-engagement-action="share"], [data-testid="share"], button[aria-label*="share" i], [role="button"][aria-label*="share" i]'
  const copyLabel = /^copy link(?: to (?:post|tweet))?$/i
  const downloadLabel = /^download video\b/i
  let active
  let timer

  function visible(item) {
    return item.checkVisibility({ checkVisibilityCSS: true }) && !item.closest('[aria-hidden="true"]')
  }

  function clear() {
    if (!active) return
    observer.disconnect()
    active.image?.remove()
    active = undefined
    clearTimeout(timer)
  }

  function placeLast() {
    const native = [...active.menu.querySelectorAll('[role="menuitem"]')]
      .filter(item => item !== active.image && visible(item))
    if (!native.length) return
    let last
    let bottom = -Infinity
    for (const item of native) {
      const edge = item.getBoundingClientRect().bottom
      if (edge < bottom) continue
      last = item
      bottom = edge
    }
    let row = last
    while (row.parentElement !== active.menu && !native.some(item => item !== last && row.parentElement.contains(item))) {
      row = row.parentElement
    }
    const style = getComputedStyle(row.parentElement)
    const reverse = style.flexDirection === 'column-reverse'
    const order = /flex|grid/.test(style.display) ? (reverse ? '-2147483647' : '2147483647') : ''
    if (active.image.style.order !== order) active.image.style.order = order
    if (reverse && row.previousElementSibling !== active.image) row.before(active.image)
    if (!reverse && row.nextElementSibling !== active.image) row.after(active.image)
  }

  function syncImage() {
    if (!active?.copy?.isConnected) return
    if (!settings.copyImage) {
      active.image?.remove()
      return
    }
    if (active.image) {
      placeLast()
      return
    }
    const image = document.createElement('button')
    image.type = 'button'
    image.setAttribute('role', 'menuitem')
    image.setAttribute('aria-label', 'Copy as image')
    image.className = 'better-x-copy-image'
    const nativeLabel = Array.from(active.copy.querySelectorAll('span, [dir]'))
      .findLast(element => element.textContent.trim()) || active.copy
    const style = getComputedStyle(nativeLabel)
    image.style.font = `${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`
    image.style.color = style.color
    image.style.minHeight = `${active.copy.getBoundingClientRect().height}px`
    const ns = 'http://www.w3.org/2000/svg'
    const icon = document.createElementNS(ns, 'svg')
    const clip = document.createElementNS(ns, 'rect')
    for (const [key, value] of Object.entries({ width: 8, height: 4, x: 8, y: 2, rx: 1, ry: 1 })) {
      clip.setAttribute(key, value)
    }
    icon.append(clip)
    for (const d of [
      'M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
      'M16 4h2a2 2 0 0 1 2 2v4',
      'M21 14H11',
      'm15 10-4 4 4 4',
    ]) {
      const path = document.createElementNS(ns, 'path')
      path.setAttribute('d', d)
      icon.append(path)
    }
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('class', 'better-x-clipboard')
    icon.setAttribute('aria-hidden', 'true')
    image.append(icon, 'Copy as image')
    image.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
    })
    image.addEventListener('click', async event => {
      event.stopPropagation()
      if (!settings.copyImage || !active?.post.isConnected || image.hasAttribute('aria-busy')) return
      const { post, link } = active
      if (postLink(post)?.href !== link.href) {
        notice('Could not locate post')
        return
      }
      image.setAttribute('aria-busy', 'true')
      try {
        await copyPostImage(post, link)
        image.dataset.copied = 'true'
        notice('Copied post image')
        setTimeout(() => { delete image.dataset.copied }, 1600)
      } catch (error) {
        notice(error instanceof Error ? error.message : 'Could not copy post image')
      } finally {
        image.removeAttribute('aria-busy')
      }
    })
    active.image = image
    placeLast()
  }

  function findMenu() {
    if (!active) return
    if (active.menu && (!active.menu.isConnected || (active.copy.isConnected && !visible(active.copy)))) {
      clear()
      return
    }
    if (active.copy?.isConnected) {
      syncImage()
      return
    }

    for (const menu of document.querySelectorAll(menuSelector)) {
      if (active.previous.has(menu)) continue
      const items = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      const copy = items.find(item => copyLabel.test(item.textContent.trim().replace(/\s+/g, ' '))) ||
        items.find(item => item.querySelector('svg path[d^="M18.36 5.64"], svg path[d^="M11.96 14.945"]'))
      if (!copy || !visible(copy)) continue
      Object.assign(active, { menu, copy })
      clearTimeout(timer)
      syncImage()
      break
    }
  }

  function start(trigger) {
    const post = trigger.closest(postSelector) || trigger.closest('[role="dialog"]')?.querySelector('article')
    const link = post && postLink(post)
    if (!link || (!settings.copyImage && !settings.downloads)) return
    const previous = new Set(Array.from(document.querySelectorAll(menuSelector)).filter(visible))
    active = { trigger, post, link, previous }
    observer.observe(document, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'aria-hidden', 'class'],
    })
    timer = setTimeout(clear, 1800)
  }

  function handle(event) {
    const target = event.target
    if (!(target instanceof Element) || active?.menu?.contains(target)) return
    const trigger = target.closest(shareSelector) || target.closest('[role="group"] [aria-haspopup="menu"]:not([data-testid])')
    if (trigger && active?.trigger === trigger) return
    clear()
    if (trigger) start(trigger)
  }

  function blockDownload(event) {
    const item = event.target instanceof Element && active?.menu?.contains(event.target) && event.target.closest('[role="menuitem"]')
    if (!item || !settings.downloads || !downloadLabel.test(item.textContent.trim())) return false
    event.preventDefault()
    event.stopImmediatePropagation()
    return true
  }

  function runDownload(event) {
    if (!blockDownload(event)) return false
    const { link, menu } = active
    closeMenu(menu)
    downloadVideo(link)
    return true
  }

  window.addEventListener('pointerdown', event => {
    if (!blockDownload(event) && event.button === 0) handle(event)
  }, true)
  for (const type of ['pointerup', 'mousedown', 'mouseup']) window.addEventListener(type, blockDownload, true)
  window.addEventListener('click', event => runDownload(event) || handle(event), true)
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') clear()
    if ((event.key === 'Enter' || event.key === ' ') && !runDownload(event)) handle(event)
  }, true)
  const observer = new MutationObserver(records => {
    if (active && menuChanged(records, menuSelector, active.menu, active.image)) findMenu()
  })
  chrome.storage.onChanged.addListener(syncImage)
})()
