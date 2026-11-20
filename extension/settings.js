(() => {
  const linkHosts = ['x.com', 'vxtwitter.com', 'fxtwitter.com']
  const defaults = {
    ads: true,
    ageWarning: false,
    telemetry: true,
    cleanLinks: true,
    linkHost: 'x.com',
    downloads: true,
    copyImage: true,
    quiet: false,
  }

  function normalize(key, value) {
    if (key === 'linkHost') return linkHosts.includes(value) ? value : defaults.linkHost
    return typeof value === 'boolean' ? value : defaults[key]
  }

  async function load() {
    const saved = await chrome.storage.local.get(Object.keys(defaults))
    return Object.fromEntries(Object.keys(defaults).map(key => [key, normalize(key, saved[key])]))
  }

  globalThis.BetterXSettings = { defaults, load, normalize }
})()
