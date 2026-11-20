(() => {
  const imageDefaults = {
    surface: 'ios-timeline', width: 430, dpr: 3, theme: 'auto', expanded: false,
  }
  const surfaces = new Set(['web-timeline', 'web-detail', 'ios-timeline', 'ios-detail'])
  const ranges = { quietWidth: [480, 1000], quietSize: [12, 20] }
  const themes = new Set(['x', 'dark', 'light'])
  const navigation = {
    home: 'Home',
    explore: 'Explore',
    notifications: 'Notifications',
    follow: 'Follow',
    chat: 'Chat',
    calls: 'Calls',
    grok: 'Grok',
    history: 'History',
    bookmarks: 'Bookmarks',
    studio: 'Creator Studio',
    premium: 'Premium',
    profile: 'Profile',
    more: 'More',
    post: 'Post',
  }
  const defaults = {
    ads: true,
    ageWarning: false,
    telemetry: true,
    cleanLinks: true,
    linkHost: 'x.com',
    downloads: true,
    copyImage: true,
    imageExport: { ...imageDefaults, autoExpand: true },
    quiet: false,
    quietWidth: 600,
    quietSize: 15,
    quietFont: '',
    quietTheme: 'x',
    quietAccent: '#e5675f',
    ...Object.fromEntries(Object.keys(navigation).map(key => [`nav:${key}`, true])),
  }

  function normalizeImageExport(value) {
    return {
      surface: surfaces.has(value?.surface) ? value.surface : imageDefaults.surface,
      width: Number.isInteger(value?.width) && value.width >= 280 && value.width <= 1200 ? value.width : imageDefaults.width,
      dpr: [1, 2, 3].includes(value?.dpr) ? value.dpr : imageDefaults.dpr,
      theme: ['light', 'dark'].includes(value?.theme) ? value.theme : imageDefaults.theme,
      expanded: value?.expanded === true,
      autoExpand: value?.autoExpand !== false,
    }
  }

  function linkDomain(value) {
    if (typeof value !== 'string') return null
    const input = value.trim()
    if (!/^(?:https?:\/\/)?[^:/?#@\s]+\/?$/i.test(input)) return null
    const source = /^https?:\/\//i.test(input) ? input : 'https://' + input
    if (!URL.canParse(source)) return null
    const url = new URL(source)
    if (url.pathname !== '/' || url.port || url.username || url.password) return null
    const domain = url.hostname.replace(/\.$/, '')
    if (!domain || domain.length > 253 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(domain)) return null
    return domain
  }

  function normalize(key, value) {
    if (key === 'linkHost') return linkDomain(value) ?? defaults.linkHost
    if (key === 'imageExport') return normalizeImageExport(value)
    if (key === 'quietFont') {
      const font = { x: '', system: 'system-ui', mono: 'monospace' }[value] ?? value
      return typeof font === 'string' ? font.replace(/["\\;{}<>\p{Cc}]/gu, '').trim().slice(0, 100) : defaults[key]
    }
    if (key === 'quietTheme') return themes.has(value) ? value : defaults[key]
    if (key === 'quietAccent') return /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : defaults[key]
    if (ranges[key]) {
      const [min, max] = ranges[key]
      return Number.isInteger(value) && value >= min && value <= max ? value : defaults[key]
    }
    return typeof value === 'boolean' ? value : defaults[key]
  }

  async function load() {
    const saved = await chrome.storage.local.get(Object.keys(defaults))
    return Object.fromEntries(Object.keys(defaults).map(key => [key, normalize(key, saved[key])]))
  }

  globalThis.BetterXSettings = { defaults, linkDomain, load, navigation, normalize }
})()
