(() => {
  const { settings } = BetterX
  const root = document.documentElement
  const counts = [['like', 'like', 'likes'], ['retweet', 'repost', 'reposts'], ['reply', 'reply', 'replies']]
  let frame = 0

  function summary(group) {
    return counts.flatMap(([id, one, many]) => {
      const value = group.querySelector(`[data-testid="${id}"], [data-testid="un${id}"]`)
        ?.querySelector('[data-testid="app-text-transition-container"]')?.textContent.trim()
      return value && value !== '0' ? [`${value} ${value === '1' ? one : many}`] : []
    }).join(' · ')
  }

  function update() {
    frame = 0
    for (const group of document.querySelectorAll('article [role="group"]')) {
      const text = summary(group)
      if (group.dataset.betterXSummary !== text) group.dataset.betterXSummary = text
    }
    for (const item of document.querySelectorAll('[role="menu"] :is([role="menuitem"], a[role="link"])')) {
      item.toggleAttribute('data-better-x-handle', item.textContent.includes('@'))
    }
  }

  const observer = new MutationObserver(() => {
    frame ||= requestAnimationFrame(update)
  })

  function sync() {
    if (settings.quiet) {
      observer.observe(root, { childList: true, subtree: true, characterData: true })
      frame ||= requestAnimationFrame(update)
      return
    }
    observer.disconnect()
    cancelAnimationFrame(frame)
    frame = 0
  }

  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-better-x-quiet'] })
  sync()
})()
