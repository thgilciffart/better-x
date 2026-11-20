(() => {
  const { settings, notice, postLink, postSelector, copyPostImage } = BetterX
  const menuSelector = '[role="menu"], [data-testid="Dropdown"], [data-testid="sheetDialog"]'
  const shareSelector = '[data-testid="share"], button[aria-label*="share" i], [role="button"][aria-label*="share" i]'
  const copyLabel = /^copy link(?: to (?:post|tweet))?$/i
  let active
  let timer

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
    image.className = 'better-x-copy-image'
    image.textContent = 'Copy as image'
    image.addEventListener('click', event => {
      event.stopPropagation()
      if (!settings.copyImage || !active?.post.isConnected) return
      const { post, link, menu } = active
      copyPostImage(post, link).then(
        () => notice('Copied post image'),
        () => notice('Could not copy post image'),
      )
      closeMenu(menu)
    })
    active.copy.after(image)
    active.image = image
  }

  function findMenu() {
    if (!active) return
    if (active.menu && !active.menu.isConnected) {
      clear()
      return
    }
    if (active.copy?.isConnected) return

    for (const menu of document.querySelectorAll(menuSelector)) {
      const items = Array.from(menu.querySelectorAll('[role="menuitem"]'))
      const copy = items.find(item => copyLabel.test(item.textContent.trim().replace(/\s+/g, ' '))) ||
        items.find(item => item.querySelector('svg path[d^="M18.36 5.64"], svg path[d^="M11.96 14.945"]'))
      if (!copy || !copy.getClientRects().length || active.previous.has(menu)) continue
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
    const previous = new Set(Array.from(document.querySelectorAll(menuSelector)).filter(menu => menu.getClientRects().length))
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
        () => notice('Copied link'),
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
  new MutationObserver(findMenu).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] })
  chrome.storage.onChanged.addListener(syncImage)
})()
