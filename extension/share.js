(() => {
  const { settings, notice, postLink, postSelector, copyPostImage, downloadPostVideo } = BetterX
  const shareSelector = '[data-engagement-action="share"], [data-testid="share"], :is(button, [role="button"]):is([aria-label="Share" i], [aria-label="Share post" i], [aria-label="Share Tweet" i])'
  const menuSelector = '[role="menu"], [data-testid="Dropdown"], [data-testid="sheetDialog"]'
  const hidden = '[hidden], [aria-hidden="true"]'
  const downloadLabel = /^download (?:video|gif)\b/i
  let active

  function clear() {
    if (!active) return
    active.observer.disconnect()
    active.placement?.disconnect()
    clearTimeout(active.timeout)
    active.image?.remove()
    active = undefined
  }

  function isDownload(item) {
    return downloadLabel.test(item.getAttribute('aria-label')?.trim() || '') ||
      downloadLabel.test(item.textContent.trim())
  }

  function addImage(share, items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'better-x-menu-item'
    button.setAttribute('role', 'menuitem')
    button.textContent = 'Copy as image'
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
    })
    button.addEventListener('click', async event => {
      event.stopPropagation()
      if (!event.isTrusted || !settings.copyImage || button.hasAttribute('aria-busy')) return
      const { post, link } = share
      if (!post.isConnected || postLink(post)?.href !== link.href) {
        notice('Could not locate post')
        return
      }
      button.setAttribute('aria-busy', 'true')
      try {
        await copyPostImage(post, link)
        notice('Copied post image')
      } catch (error) {
        notice(error?.message || 'Could not copy post image')
      } finally {
        button.removeAttribute('aria-busy')
      }
    })

    const last = items.at(-1)
    let row = last
    while (row.parentElement !== share.menu && !items.some(item => item !== last && row.parentElement.contains(item))) {
      row = row.parentElement
    }
    const parent = row.parentElement
    share.image = button
    share.placement = new ResizeObserver(() => {
      share.placement.disconnect()
      if (share !== active || !row.isConnected || !settings.copyImage) return
      const { display, flexDirection } = getComputedStyle(parent)
      const reverse = flexDirection === 'column-reverse'
      if (/flex|grid/.test(display)) button.style.order = reverse ? '-2147483647' : '2147483647'
      if (reverse) row.before(button)
      else row.after(button)
    })
    share.placement.observe(parent)
  }

  function downloadRow(event) {
    const { target } = event
    const item = event.isTrusted && target instanceof Element && target.closest('[role="menuitem"]')
    if (!settings.downloads || !item || !active?.menu?.contains(item) || !isDownload(item)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    return active
  }

  function runDownload({ post, link }) {
    if (!post.isConnected || postLink(post)?.href !== link.href) {
      notice('Could not locate post')
      return
    }
    downloadPostVideo(post, link)
  }

  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
    window.addEventListener(type, downloadRow, true)
  }

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') clear()
    if (event.key !== 'Enter' && event.key !== ' ') return
    const share = downloadRow(event)
    if (share && !event.repeat) runDownload(share)
  }, true)

  window.addEventListener('keyup', event => {
    if (event.key === 'Enter' || event.key === ' ') downloadRow(event)
  }, true)

  window.addEventListener('click', event => {
    const { target } = event
    if (!event.isTrusted || !(target instanceof Element) || active?.image?.contains(target)) return
    const share = downloadRow(event)
    if (share) {
      runDownload(share)
      return
    }
    clear()
    if (!settings.copyImage && !settings.downloads) return
    const trigger = target.closest(shareSelector)
    const post = trigger?.closest(postSelector) || trigger?.closest('dialog, [role="dialog"]')?.querySelector('article')
    const link = post && postLink(post)
    if (!link) return

    const layer = document.getElementById('layers') || document.body
    const previous = new Set([...layer.querySelectorAll(menuSelector)].filter(menu => !menu.closest(hidden)))
    const observer = new MutationObserver(() => {
      for (const menu of layer.querySelectorAll(menuSelector)) {
        if (previous.has(menu) || menu.closest(hidden)) continue
        const items = [...menu.querySelectorAll('[role="menuitem"]')].filter(item => !item.closest(hidden))
        const copy = items.some(item => /^copy link(?: to (?:post|tweet))?$/i.test(item.textContent.trim().replace(/\s+/g, ' ')) ||
          item.querySelector('svg path[d^="M18.36 5.64"], svg path[d^="M11.96 14.945"]'))
        if (!copy && !items.some(isDownload)) continue
        observer.disconnect()
        clearTimeout(active.timeout)
        active.menu = menu
        if (settings.copyImage) addImage(active, items)
        return
      }
    })
    observer.observe(layer, {
      childList: true, subtree: true, characterData: true,
      attributeFilter: ['aria-hidden', 'hidden', 'role'],
    })
    active = { post, link, observer, timeout: setTimeout(clear, 1500) }
  }, true)
})()
