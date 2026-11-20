(() => {
  const { settings } = BetterX
  const root = document.documentElement
  const metric = '[data-testid="app-text-transition-container"]'
  const countsClass = 'better-x-quiet-counts'
  const labels = [
    ['[data-testid="like"], [data-testid="unlike"]', 'like', 'likes'],
    ['[data-testid="retweet"], [data-testid="unretweet"]', 'repost', 'reposts'],
    ['[data-testid="reply"]', 'reply', 'replies'],
  ]
  let frame = 0

  function update() {
    frame = 0
    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      const group = article.querySelector('[role="group"]:has([data-testid="reply"])')
      if (!group) continue
      let counts = group.querySelector('.' + countsClass)
      const parts = article.querySelector('[data-testid="User-Name"] time') ? labels.flatMap(([selector, singular, plural]) => {
        const value = group.querySelector(selector)?.querySelector(metric)?.textContent.trim()
        return value && value !== '0' ? [value + ' ' + (value === '1' ? singular : plural)] : []
      }) : []
      if (!parts.length) {
        counts?.remove()
        continue
      }
      const text = parts.join(' · ')
      if (!counts) {
        counts = document.createElement('span')
        counts.className = countsClass
        counts.setAttribute('aria-hidden', 'true')
        group.prepend(counts)
      }
      if (counts.textContent !== text) counts.textContent = text
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update)
  }

  const feed = new MutationObserver(records => {
    if (records.some(record => !record.target.parentElement?.closest('.' + countsClass))) schedule()
  })

  function sync() {
    if (settings.quiet) {
      feed.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-testid'] })
      schedule()
      return
    }
    feed.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
    for (const counts of document.querySelectorAll('.' + countsClass)) counts.remove()
  }

  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-better-x-quiet'] })
  sync()
})()
