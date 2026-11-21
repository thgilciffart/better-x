(() => {
  function cleanCopiedLink(text, host = 'x.com', clean = true) {
    if (typeof text !== 'string') return text
    const match = text.trim().match(/^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/(?:\w+|i\/web)\/status\/\d+(?:[?#]\S*)?$/i)
    if (!match) return text
    const url = new URL(match[0])
    const time = url.searchParams.get('t')
    const timed = /^\d+$/.test(time || '')
    url.hostname = timed ? 'x.com' : host
    if (clean) {
      url.search = timed ? `t=${time}` : ''
      url.hash = ''
    }
    return url.href
  }

  globalThis.BetterXLinks = { cleanCopiedLink }
})()
