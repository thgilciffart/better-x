(() => {
  const { defaults, load, navigation, normalize } = BetterXSettings
  const settings = { ...defaults }
  const attributes = {
    ads: 'data-better-x-ads',
    ageWarning: 'data-better-x-age-warning',
    quiet: 'data-better-x-quiet',
  }
  const origins = new Set(['https://x.com', 'https://twitter.com', 'https://www.x.com', 'https://www.twitter.com'])
  const postSelector = 'article, [data-testid="quoteTweet"], div[role="link"]:has([data-testid="User-Name"])'

  function apply() {
    const root = document.documentElement
    if (!root) return
    for (const [key, attribute] of Object.entries(attributes)) {
      root.setAttribute(attribute, String(settings[key]))
    }
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

  globalThis.BetterX = { settings, notice, postLink, postSelector }

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
