(() => {
  const { settings } = BetterX
  const root = document.documentElement
  const counts = [['like', 'like', 'likes'], ['retweet', 'repost', 'reposts'], ['reply', 'reply', 'replies']]
  const groupSelector = 'article [role="group"]'
  const searchButtons = new Map()
  let searchDialog
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

  function openSearch() {
    if (root.dataset.betterXQuiet !== 'true' || document.querySelector('dialog[open], [aria-modal="true"]')) return false
    if (!searchDialog) {
      searchDialog = document.createElement('dialog')
      searchDialog.className = 'better-x-search'
      searchDialog.setAttribute('aria-labelledby', 'better-x-search-label')
      searchDialog.innerHTML = `
        <form action="/search" method="get" role="search">
          <div class="better-x-search-field">
            <label for="better-x-search-query" id="better-x-search-label">Search 𝕏</label>
            <input id="better-x-search-query" type="search" name="q" placeholder="Search 𝕏"
              inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="none"
              spellcheck="false" required autofocus>
            <button type="button" aria-label="Close Search"><kbd aria-hidden="true">Esc</kbd></button>
          </div>
          <input type="hidden" name="src" value="typed_query">
          <button type="submit">Search <kbd aria-hidden="true">↵</kbd></button>
        </form>`
      const form = searchDialog.querySelector('form')
      const input = form.elements.q
      form.querySelector('[type="button"]').addEventListener('click', () => searchDialog.close())
      form.addEventListener('submit', event => {
        input.value = input.value.trim()
        if (!input.value) {
          event.preventDefault()
          input.reportValidity()
        }
      })
      document.body.append(searchDialog)
    }
    const input = searchDialog.querySelector('input[type="search"]')
    input.value = location.pathname === '/search' ? new URLSearchParams(location.search).get('q') ?? '' : ''
    searchDialog.showModal()
    input.select()
    return true
  }

  function mountSearch(slot, parent, after) {
    let button = searchButtons.get(slot)
    if (!parent) {
      button?.remove()
      return
    }
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.className = 'better-x-search-trigger'
      button.setAttribute('aria-haspopup', 'dialog')
      button.setAttribute('aria-keyshortcuts', 'Control+/')
      button.innerHTML = 'Search <kbd aria-hidden="true">Ctrl+/</kbd>'
      button.addEventListener('click', openSearch)
      searchButtons.set(slot, button)
    }
    if (after && after.nextElementSibling !== button) after.after(button)
    else if (button.parentElement !== parent) parent.append(button)
  }

  function searchShortcut(event) {
    if (event.key !== '/' || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
        event.isComposing || event.repeat || event.defaultPrevented) return
    if (event.composedPath().some(target => target instanceof Element &&
        (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]')))) return
    if (!openSearch()) return
    event.preventDefault()
    event.stopPropagation()
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
    const rail = document.querySelector('header[role="banner"] nav:not([data-testid="BottomBar"] *)')
    const post = rail?.closest('header')?.querySelector('[data-testid="SideNav_NewTweet_Button"]')
    mountSearch('rail', post?.parentElement || rail, post)
    mountSearch('compact', document.querySelector('[data-testid="BottomBar"] nav'))
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
      window.addEventListener('keydown', searchShortcut, true)
      observer.observe(root, {
        childList: true, subtree: true, characterData: true,
        attributeFilter: ['role', 'data-testid', 'data-better-x-summary'],
      })
      frame ||= requestAnimationFrame(update)
      return
    }
    window.removeEventListener('keydown', searchShortcut, true)
    for (const button of searchButtons.values()) button.remove()
    searchDialog?.close()
    observer.disconnect()
    pending = undefined
    cancelAnimationFrame(frame)
    frame = 0
  }

  new MutationObserver(sync).observe(root, { attributeFilter: ['data-better-x-quiet-requested'] })
  sync()
})()
