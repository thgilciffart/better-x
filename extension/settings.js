(() => {
  const linkHosts = ['x.com', 'vxtwitter.com', 'fxtwitter.com']
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
    quiet: false,
    ...Object.fromEntries(Object.keys(navigation).map(key => [`nav:${key}`, true])),
  }

  function normalize(key, value) {
    if (key === 'linkHost') return linkHosts.includes(value) ? value : defaults.linkHost
    return typeof value === 'boolean' ? value : defaults[key]
  }

  async function load() {
    const saved = await chrome.storage.local.get(Object.keys(defaults))
    return Object.fromEntries(Object.keys(defaults).map(key => [key, normalize(key, saved[key])]))
  }

  globalThis.BetterXSettings = { defaults, load, navigation, normalize }
})()
