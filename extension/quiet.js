(() => {
  const { settings } = BetterX
  const root = document.documentElement
  const counts = [['like', 'like', 'likes'], ['retweet', 'repost', 'reposts'], ['reply', 'reply', 'replies']]
  const groupSelector = 'article [role="group"]'
  let stylesheet
  let loadingStyle
  let pending
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
    for (const group of pending || document.querySelectorAll(groupSelector)) {
      if (pending && (!root.contains(group) || !group.matches(groupSelector))) continue
      const text = summary(group)
      if (group.dataset.betterXSummary !== text) group.dataset.betterXSummary = text
    }
    pending = new Set()
    for (const item of document.querySelectorAll('[role="menu"] :is([role="menuitem"], a[role="link"])')) {
      item.toggleAttribute('data-better-x-handle', item.textContent.includes('@'))
    }
    const path = location.pathname
    for (const link of document.querySelectorAll(':is(header[role="banner"] nav, [data-testid="BottomBar"]) a[href^="/"]')) {
      const href = link.getAttribute('href')
      link.toggleAttribute('data-better-x-current', path === href || path.startsWith(`${href}/`))
    }
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type !== 'attributes') frame ||= requestAnimationFrame(update)
      if (!pending) continue
      const target = record.target
      const element = target.nodeType === 1 ? target : target.parentElement
      let group = element?.closest(groupSelector)
      while (group) {
        pending.add(group)
        group = group.parentElement?.closest(groupSelector)
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.matches(groupSelector)) pending.add(node)
        for (const child of node.querySelectorAll(groupSelector)) pending.add(child)
      }
    }
  })

  async function syncStyle() {
    if (!settings.quiet) {
      root.dataset.betterXQuiet = 'false'
      if (stylesheet && document.adoptedStyleSheets.includes(stylesheet)) {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(sheet => sheet !== stylesheet)
      }
      return
    }
    if (!stylesheet) {
      loadingStyle ??= chrome.runtime.sendMessage({ type: 'quiet-style' }).then(css => {
        if (!css) throw new Error('Quiet Mode stylesheet is unavailable')
        stylesheet = new CSSStyleSheet()
        stylesheet.replaceSync(css)
      }).catch(console.error).finally(() => { loadingStyle = undefined })
      await loadingStyle
    }
    if (!settings.quiet || !stylesheet || document.adoptedStyleSheets.includes(stylesheet)) return
    root.dataset.betterXQuietStarting = ''
    document.adoptedStyleSheets.push(stylesheet)
    root.dataset.betterXQuiet = 'true'
    void root.offsetHeight
    delete root.dataset.betterXQuietStarting
  }

  function sync() {
    syncStyle()
    if (settings.quiet) {
      observer.observe(root, {
        childList: true, subtree: true, characterData: true,
        attributeFilter: ['role', 'data-testid', 'data-better-x-summary'],
      })
      frame ||= requestAnimationFrame(update)
      return
    }
    observer.disconnect()
    pending = undefined
    cancelAnimationFrame(frame)
    frame = 0
  }

  new MutationObserver(sync).observe(root, { attributeFilter: ['data-better-x-quiet-requested'] })
  sync()
})()
