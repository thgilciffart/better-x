(() => {
  const { settings, notice, postLink, postSelector, copyPostImage } = BetterX
  const menuSelector = '[role="menu"], [data-testid="Dropdown"], [data-testid="sheetDialog"]'
  const shareSelector = '[data-testid="share"], button[aria-label*="share" i], [role="button"][aria-label*="share" i]'
  const copyLabel = /^copy link(?: to (?:post|tweet))?$/i
  let active
  let timer

  function visible(item) {
    return item.getClientRects().length && item.checkVisibility({ checkVisibilityCSS: true }) &&
      !item.closest('[aria-hidden="true"]')
  }

  function clear() {
    active?.image?.remove()
    active = undefined
    clearTimeout(timer)
  }

  function closeMenu(menu) {
    const event = new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true,
    })
    menu.dispatchEvent(event)
    queueMicrotask(() => {
      if (menu.isConnected) menu.closest('#layers')?.querySelector('[data-testid="mask"]')?.click()
    })
  }

  function syncImage() {
    if (!active?.copy?.isConnected) return
    if (!settings.copyImage) {
      active.image?.remove()
      return
    }
    if (active.image?.isConnected) return
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
    const outline = document.createElementNS(ns, 'path')
    outline.setAttribute('d', 'M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 3h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z')
    icon.append(outline)
    icon.setAttribute('viewBox', '0 0 24 24')
    icon.setAttribute('class', 'better-x-clipboard')
    icon.setAttribute('aria-hidden', 'true')
    const status = document.createElement('span')
    status.className = 'better-x-copy-status'
    status.setAttribute('role', 'status')
    image.append(icon, 'Copy as image', status)
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
      status.textContent = ''
      try {
        await copyPostImage(post, link)
        image.dataset.copied = 'true'
        status.textContent = 'Copied post image'
        setTimeout(() => { delete image.dataset.copied }, 1600)
      } catch {
        notice('Could not copy post image')
      } finally {
        image.removeAttribute('aria-busy')
      }
    })
    let row = active.copy
    while (row.parentElement !== active.menu && row.parentElement.querySelectorAll('[role="menuitem"]').length === 1) {
      row = row.parentElement
    }
    if (getComputedStyle(row.parentElement).flexDirection === 'column-reverse') row.before(image)
    else row.after(image)
    active.image = image
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
      const items = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      const copy = items.find(item => copyLabel.test(item.textContent.trim().replace(/\s+/g, ' '))) ||
        items.find(item => item.querySelector('svg path[d^="M18.36 5.64"], svg path[d^="M11.96 14.945"]'))
      if (!copy || !visible(copy) || active.previous.has(menu)) continue
      Object.assign(active, { menu, copy })
      clearTimeout(timer)
      syncImage()
      break
    }
  }

  function start(trigger) {
    const post = trigger.closest(postSelector) || trigger.closest('[role="dialog"]')?.querySelector('article')
    const link = post && postLink(post)
    if (!link || (!settings.cleanLinks && !settings.copyImage)) return
    const previous = new Set(Array.from(document.querySelectorAll(menuSelector)).filter(visible))
    active = { post, link, previous }
    timer = setTimeout(clear, 1800)
  }

  function handle(event) {
    const target = event.target
    if (!(target instanceof Element)) return
    if (active?.copy?.contains(target) && settings.cleanLinks && active.post.isConnected) {
      event.preventDefault()
      event.stopImmediatePropagation()
      const { link, menu } = active
      const url = new URL(link)
      url.hostname = settings.linkHost
      navigator.clipboard.writeText(url.href).then(
        () => {
          if (!document.querySelector('[data-testid="toast"]')?.getClientRects().length) notice('Copied link')
        },
        () => notice('Could not copy link'),
      )
      closeMenu(menu)
      return
    }
    if (active?.menu?.contains(target)) return
    const trigger = target.closest(shareSelector) || target.closest('[role="group"] [aria-haspopup="menu"]:not([data-testid])')
    clear()
    if (trigger) start(trigger)
  }

  document.addEventListener('click', handle, true)
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') clear()
    if (event.key === 'Enter' || event.key === ' ') handle(event)
  }, true)
  new MutationObserver(findMenu).observe(document, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden', 'aria-hidden', 'class'],
  })
  chrome.storage.onChanged.addListener(syncImage)
})()
