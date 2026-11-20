(() => {
  const linkHosts = ['x.com', 'vxtwitter.com', 'fxtwitter.com']
  const imagePresets = [
    ['Web Timeline · 390', 'web-timeline', 390, 2],
    ['Web Detail · 390', 'web-detail', 390, 2],
    ['Web Desktop · 600', 'web-timeline', 600, 2],
    ['iPhone Duo · 382', 'ios-timeline', 382, 3],
    ['iOS Detail · 382', 'ios-detail', 382, 3],
    ['iPhone Pro Max · 430', 'ios-timeline', 430, 3],
    ['Duo Landscape · 594', 'ios-timeline', 594, 3],
    ['Web Narrow · 320', 'web-timeline', 320, 2],
  ].map(([label, surface, width, dpr]) => ({ label, surface, width, dpr }))
  const imageDefaults = {
    surface: 'ios-timeline', width: 430, dpr: 3, theme: 'light', fontScale: 1, expanded: false,
  }
  const surfaces = new Set(imagePresets.map(preset => preset.surface))
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
    imageExport: { ...imageDefaults, autoExpand: true, variants: [] },
    quiet: false,
    ...Object.fromEntries(Object.keys(navigation).map(key => [`nav:${key}`, true])),
  }

  function normalizeVariant(value) {
    return {
      surface: surfaces.has(value?.surface) ? value.surface : imageDefaults.surface,
      width: Number.isInteger(value?.width) && value.width >= 280 && value.width <= 1200 ? value.width : imageDefaults.width,
      dpr: [1, 2, 3].includes(value?.dpr) ? value.dpr : imageDefaults.dpr,
      theme: value?.theme === 'dark' ? 'dark' : 'light',
      fontScale: Number.isFinite(value?.fontScale) && value.fontScale >= .8 && value.fontScale <= 1.3 ? value.fontScale : 1,
      expanded: value?.expanded === true,
    }
  }

  function normalize(key, value) {
    if (key === 'linkHost') return linkHosts.includes(value) ? value : defaults.linkHost
    if (key === 'imageExport') return {
      ...normalizeVariant(value),
      autoExpand: value?.autoExpand !== false,
      variants: Array.isArray(value?.variants) ? value.variants.map(normalizeVariant) : [],
    }
    return typeof value === 'boolean' ? value : defaults[key]
  }

  async function load() {
    const saved = await chrome.storage.local.get(Object.keys(defaults))
    return Object.fromEntries(Object.keys(defaults).map(key => [key, normalize(key, saved[key])]))
  }

  globalThis.BetterXSettings = { defaults, imagePresets, load, navigation, normalize, normalizeVariant }
})()
