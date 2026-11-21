(() => {
  const { defaults, load, navigation, normalize } = BetterXSettings
  const settings = { ...defaults }
  const attributes = {
    ads: 'data-better-x-ads',
    ageWarning: 'data-better-x-age-warning',
    quiet: 'data-better-x-quiet-requested',
    quietFont: 'data-better-x-quiet-font',
    quietTheme: 'data-better-x-quiet-theme',
    emojiFont: 'data-better-x-emoji-font',
    cleanLinks: 'data-better-x-clean-links',
    linkHost: 'data-better-x-link-host',
  }
  const lengths = { quietWidth: '--better-x-quiet-width', quietSize: '--better-x-quiet-size', quietUiSize: '--better-x-quiet-ui-size' }
  const genericFonts = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded'])
  const origins = new Set(['https://x.com', 'https://twitter.com', 'https://www.x.com', 'https://www.twitter.com'])
  const postSelector = 'article, [data-testid="quoteTweet"], div[role="link"]:has([data-testid="User-Name"])'

  function apply() {
    const root = document.documentElement
    if (!root) return
    for (const [key, attribute] of Object.entries(attributes)) {
      root.setAttribute(attribute, String(settings[key]))
    }
    for (const [key, property] of Object.entries(lengths)) {
      if (settings[key] === null) root.style.removeProperty(property)
      else root.style.setProperty(property, `${settings[key]}px`)
    }
    root.dataset.betterXAppearance = ['quietWidth', 'quietSize', 'quietUiSize', 'quietAccent']
      .filter(key => settings[key])
      .join(' ')
    const font = settings.quietFont
    if (font) root.style.setProperty('--better-x-quiet-font', genericFonts.has(font) ? font : `"${font}", system-ui, sans-serif`)
    else root.style.removeProperty('--better-x-quiet-font')
    if (settings.quietAccent) root.style.setProperty('--better-x-quiet-accent', settings.quietAccent)
    else root.style.removeProperty('--better-x-quiet-accent')
    root.dataset.betterXHiddenTabs = Object.keys(navigation)
      .filter(key => !settings[`nav:${key}`])
      .join(' ')
  }

  function parsePostLink(value) {
    if (!value) return null
    const url = new URL(value, location.origin)
    if (!origins.has(url.origin)) return null
    const match = url.pathname.match(/^\/(?:(\w+)\/status|(i\/web)\/status)\/(\d+)(?:\/|$)/)
    if (!match) return null
    return new URL(`https://x.com/${match[1] || match[2]}/status/${match[3]}`)
  }

  function postLink(container) {
    const post = container?.closest(postSelector) || container?.querySelector('article')
    if (!post) return parsePostLink(location.href)

    for (const time of post.querySelectorAll('a[href] time')) {
      if (time.closest(postSelector) !== post) continue
      const url = parsePostLink(time.closest('a').href)
      if (url) return url
    }
    if (post.getAttribute('tabindex') === '-1' && post.matches('article')) return parsePostLink(location.href)
    return null
  }

  let toast
  let toastTimer
  function notice(message) {
    if (!toast) {
      toast = document.createElement('div')
      toast.className = 'better-x-notice'
      toast.setAttribute('role', 'status')
      toast.setAttribute('aria-live', 'polite')
    }
    toast.textContent = ''
    if (!toast.isConnected) document.body.append(toast)
    requestAnimationFrame(() => { toast.textContent = message })
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.remove(), 2600)
  }

  let activeMenu

  function closeMenu(restoreFocus = false) {
    if (!activeMenu) return
    const { menu, opener } = activeMenu
    activeMenu = undefined
    if (menu.matches(':popover-open')) menu.hidePopover()
    menu.remove()
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true })
    return opener
  }

  function openMenu(actions, { label, opener, x, y, alignEnd = false, above = false }) {
    closeMenu()
    const menu = document.createElement('div')
    menu.className = 'better-x-menu'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', label)
    menu.popover = 'manual'
    menu.style.setProperty('--better-x-menu-x', `${x}px`)
    menu.style.setProperty('--better-x-menu-y', `${y}px`)
    if (alignEnd) menu.style.setProperty('--better-x-menu-offset-x', '-100%')
    if (above) menu.style.setProperty('--better-x-menu-offset-y', '-100%')

    for (const [title, run, success, failure] of actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.className = 'better-x-menu-item'
      button.textContent = title
      button.addEventListener('click', async event => {
        event.stopPropagation()
        if (!event.isTrusted || activeMenu?.menu !== menu) return
        closeMenu(event.detail === 0)
        try {
          await run()
          if (success) notice(success)
        } catch (error) {
          notice(failure || error?.message || `Could not ${title.toLowerCase()}`)
        }
      })
      menu.append(button)
    }
    menu.addEventListener('keydown', event => {
      const item = event.target
      const next = {
        ArrowDown: item.nextElementSibling || menu.firstElementChild,
        ArrowUp: item.previousElementSibling || menu.lastElementChild,
        Home: menu.firstElementChild,
        End: menu.lastElementChild,
      }[event.key]
      if (next instanceof HTMLElement) {
        event.preventDefault()
        next.focus()
      }
      if (next || event.key === 'Enter' || event.key === ' ') event.stopPropagation()
    })
    menu.addEventListener('focusout', event => {
      if (activeMenu?.menu === menu && event.relatedTarget !== opener && !menu.contains(event.relatedTarget)) closeMenu()
    })
    menu.firstElementChild.autofocus = true
    const host = opener?.closest('dialog:modal') || document.fullscreenElement || document.body
    host.append(menu)
    activeMenu = { menu, opener }
    menu.showPopover()
  }

  document.addEventListener('fullscreenchange', () => closeMenu())
  document.addEventListener('pointerdown', event => {
    if (activeMenu && !activeMenu.menu.contains(event.target)) closeMenu()
  }, true)
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !activeMenu?.menu.matches(':popover-open')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    closeMenu(true)
  }, true)

  globalThis.BetterX = { settings, notice, postLink, postSelector, closeMenu, openMenu }

  if (document.documentElement) {
    apply()
  } else {
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return
      observer.disconnect()
      apply()
    })
    observer.observe(document, { childList: true })
  }

  const changed = new Set()
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (!Object.hasOwn(defaults, key)) continue
      changed.add(key)
      settings[key] = normalize(key, newValue)
    }
    if (Object.hasOwn(changes, 'downloads') || Object.hasOwn(changes, 'copyImage')) closeMenu()
    apply()
  })

  load().then(saved => {
    for (const [key, value] of Object.entries(saved)) {
      if (!changed.has(key)) settings[key] = value
    }
    apply()
  }).catch(console.error)
})()
