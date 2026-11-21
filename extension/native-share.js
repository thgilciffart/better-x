(() => {
  const { settings, notice, postLink, postSelector, copyPostImage } = BetterX
  const shareSelector = '[data-engagement-action="share"], [data-testid="share"], :is(button, [role="button"]):is([aria-label="Share" i], [aria-label="Share post" i], [aria-label="Share Tweet" i])'
  const menuSelector = '[role="menu"], [data-testid="Dropdown"], [data-testid="sheetDialog"]'
  const hidden = '[hidden], [aria-hidden="true"]'
  let stopWatching
  let exportButton

  window.addEventListener('click', event => {
    const { target } = event
    if (!event.isTrusted || !(target instanceof Element) || exportButton?.contains(target)) return
    stopWatching?.()
    exportButton?.remove()
    exportButton = undefined
    if (!settings.copyImage) return
    const trigger = target.closest(shareSelector)
    const post = trigger?.closest(postSelector) || trigger?.closest('dialog, [role="dialog"]')?.querySelector('article')
    const link = post && postLink(post)
    if (!link) return

    const layer = document.getElementById('layers') || document.body
    const previous = new Set([...layer.querySelectorAll(menuSelector)].filter(menu => !menu.closest(hidden)))
    const stop = () => {
      observer.disconnect()
      clearTimeout(timeout)
      stopWatching = undefined
    }

    function addExport() {
      for (const menu of layer.querySelectorAll(menuSelector)) {
        if (previous.has(menu) || menu.closest(hidden)) continue
        const items = [...menu.querySelectorAll('[role="menuitem"]')]
        const copy = items.find(item => /^copy link(?: to (?:post|tweet))?$/i.test(item.textContent.trim().replace(/\s+/g, ' '))) ||
          items.find(item => item.querySelector('svg path[d^="M18.36 5.64"], svg path[d^="M11.96 14.945"]'))
        if (!copy) continue

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
        exportButton = button
        stop()
        copy.after(button)
        return
      }
    }

    const observer = new MutationObserver(addExport)
    observer.observe(layer, {
      childList: true, subtree: true, characterData: true,
      attributeFilter: ['aria-hidden', 'hidden', 'role'],
    })
    const timeout = setTimeout(stop, 1500)
    stopWatching = stop
  }, true)
})()
