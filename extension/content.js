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

  function closeMenu(menu) {
    const mask = document.elementFromPoint(0, 0)
    const box = mask?.getBoundingClientRect()
    const covers = mask?.closest('#layers') && !menu.contains(mask) && box.width >= innerWidth && box.height >= innerHeight
    const target = covers ? mask : document.body
    target.click()
  }

  function menuChanged(records, selector, menu, addon) {
    for (const { type, target, addedNodes, removedNodes } of records) {
      if (addon?.contains(target)) continue
      const element = type === 'characterData' ? target.parentElement : target
      const inside = menu ? menu.contains(target) : element?.closest?.(selector)
      if (type === 'characterData') {
        if (inside) return true
        continue
      }
      if (type === 'attributes') {
        if (inside || (menu ? target.contains(menu) : target.querySelector(selector))) return true
        continue
      }
      for (const nodes of [addedNodes, removedNodes]) {
        for (const node of nodes) {
          if (node === addon) continue
          if (inside) return true
          if (node.nodeType !== Node.ELEMENT_NODE) continue
          if (menu ? node.contains(menu) : node.matches(selector) || node.querySelector(selector)) return true
        }
      }
    }
    return false
  }

  globalThis.BetterX = { settings, notice, postLink, postSelector, closeMenu, menuChanged }

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
    apply()
  })

  load().then(saved => {
    for (const [key, value] of Object.entries(saved)) {
      if (!changed.has(key)) settings[key] = value
    }
    apply()
  }).catch(console.error)
})()
