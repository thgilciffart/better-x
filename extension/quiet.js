(() => {
  const { settings } = BetterX
  const root = document.documentElement
  const counts = [['like', 'like', 'likes'], ['retweet', 'repost', 'reposts'], ['reply', 'reply', 'replies']]
  const groupSelector = 'article [role="group"]'
  const navigationSelector = 'header[role="banner"], [data-testid="BottomBar"]'
  const menuSelector = ':is([role="menu"], [data-slot="xds-menu-popup"], [data-slot$="context-menu-content"]):not(.better-x-menu)'
  const menuHeadingSelector = `${menuSelector} div:has(> [role="menuitem"]) > div:not([role]):has(> [dir])`
  const modalSelector = 'dialog[open], [aria-modal="true"], [data-testid="confirmationSheetDialog"]'
  const userActions = '[data-testid="userActions"]'
  const profileActions = 'data-better-x-profile-actions'
  const socialIcon = 'data-better-x-social-icon'
  const socialIconSelector = 'article div:has(+ div [data-testid="socialContext"])'
  const detailSelector = 'article[tabindex="-1"]'
  const detailLayout = `${detailSelector} div:has(> div > [role="group"])`
  const observedSelector = `article, ${groupSelector}, ${navigationSelector}, ${menuSelector}, ${userActions}, [${profileActions}]`
  const searchButtons = new Map()
  let searchDialog
  let nativeSearch
  let stylesheet
  let loadingStyle
  let pending
  let menus
  let navigationChanged = true
  let currentPath
  let frame = 0
  const hasElements = nodes => Array.prototype.some.call(nodes, node => node.nodeType === Node.ELEMENT_NODE)

  function summary(group) {
    return counts.flatMap(([id, one, many]) => {
      const value = group.querySelector(`[data-testid="${id}"], [data-testid="un${id}"]`)
        ?.querySelector('[data-testid="app-text-transition-container"]')?.textContent.trim()
      return value && value !== '0' ? [`${value} ${value === '1' ? one : many}`] : []
    }).join(' · ')
  }

  const searchInput = 'input[data-testid="SearchBox_Search_Input"], form[role="search"] input[role="combobox"]'
  let searchForm
  let profileResult

  function markProfileResult(option) {
    if (option === profileResult) return
    profileResult?.removeAttribute('data-better-x-go-to-profile')
    profileResult = option
    profileResult?.setAttribute('data-better-x-go-to-profile', '')
  }

  function updateSearchResults() {
    const options = searchForm.querySelectorAll('[role="listbox"] > [role="option"]')
    markProfileResult([...options].find(option => /^go to\s+@/i.test(option.textContent.trim())))
  }

  const searchResultsObserver = new MutationObserver(updateSearchResults)

  function watchSearchResults({ target }) {
    if (!(target instanceof HTMLInputElement) || !target.matches(searchInput) ||
        !target.form || target.form === searchForm) return
    searchResultsObserver.disconnect()
    searchForm = target.form
    searchResultsObserver.observe(searchForm, { childList: true, subtree: true, characterData: true })
    updateSearchResults()
  }

  function closeNativeSearch(restoreFocus = false) {
    if (!nativeSearch) return
    const { form, opener, events } = nativeSearch
    nativeSearch = undefined
    events.abort()
    if (form.matches(':popover-open')) form.hidePopover()
    form.removeAttribute('popover')
    form.classList.remove('better-x-search', 'better-x-native-search')
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true })
  }

  function openNativeSearch(input, opener) {
    const form = input?.form
    if (!form || form.hasAttribute('popover')) return false

    const events = new AbortController()
    const { signal } = events
    nativeSearch = { form, opener, events, url: location.href }
    form.classList.add('better-x-search', 'better-x-native-search')
    form.popover = 'auto'
    form.addEventListener('toggle', event => {
      if (event.newState === 'closed') closeNativeSearch()
    }, { signal })
    form.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      closeNativeSearch(true)
    }, { capture: true, signal })
    try {
      form.showPopover()
    } catch {
      closeNativeSearch()
      return false
    }
    input.focus({ preventScroll: true })
    if (document.activeElement === input) {
      input.select()
      return true
    }
    closeNativeSearch()
    return false
  }

  function openSearch(opener) {
    if (root.dataset.betterXQuiet !== 'true' ||
        [...document.querySelectorAll(modalSelector)].some(modal => modal.checkVisibility({ checkVisibilityCSS: true }))) return false
    if (nativeSearch) return false
    const inputs = [...document.querySelectorAll(searchInput)]
    const inline = inputs.find(input => input.form && input.checkVisibility({ checkVisibilityCSS: true }))
    if (inline) {
      inline.focus()
      if (document.activeElement === inline) return true
    }
    const sidebar = inputs.find(input => input.closest('[data-testid="sidebarColumn"]'))
    if (openNativeSearch(sidebar, opener)) return true
    if (!searchDialog) {
      searchDialog = document.createElement('dialog')
      searchDialog.className = 'better-x-search'
      searchDialog.setAttribute('closedby', 'any')
      searchDialog.setAttribute('aria-labelledby', 'better-x-search-label')
      searchDialog.innerHTML = `
        <form action="/search" method="get" role="search">
          <div class="better-x-search-field">
            <label for="better-x-search-query" id="better-x-search-label">search 𝕏</label>
            <input id="better-x-search-query" type="search" name="q" placeholder="search 𝕏"
              inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="none"
              spellcheck="false" required autofocus>
            <button type="button" aria-label="Close Search"><kbd aria-hidden="true">Esc</kbd></button>
          </div>
          <input type="hidden" name="src" value="typed_query">
          <button type="submit">search <kbd aria-hidden="true">↵</kbd></button>
        </form>`
      const form = searchDialog.querySelector('form')
      const input = form.elements.q
      form.querySelector('[type="button"]').addEventListener('click', () => searchDialog.close())
      searchDialog.addEventListener('click', event => {
        if (event.target !== searchDialog) return
        const { left, right, top, bottom } = searchDialog.getBoundingClientRect()
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
          searchDialog.close()
        }
      })
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
      button.setAttribute('aria-keyshortcuts', '/')
      button.innerHTML = '<span>search</span> <kbd aria-hidden="true">/</kbd>'
      button.addEventListener('click', () => openSearch(button))
      searchButtons.set(slot, button)
    }
    if (after && after.nextElementSibling !== button) after.after(button)
    else if (button.parentElement !== parent) parent.append(button)
  }

  function handleSearchKey(event) {
    const input = event.target
    if (event.key === 'Escape' && !nativeSearch && input instanceof HTMLInputElement && input.matches(searchInput)) {
      setTimeout(() => {
        if (document.activeElement === input) input.blur()
      }, 0)
      return
    }
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey ||
        event.isComposing || event.repeat || event.defaultPrevented) return
    if (event.composedPath().some(target => target instanceof Element &&
        (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]')))) return
    if (!openSearch(document.activeElement)) return
    event.preventDefault()
    event.stopPropagation()
  }

  function markMatches(scope, selector, attribute) {
    const matches = new Set(scope.querySelectorAll(selector))
    for (const item of scope.querySelectorAll(`[${attribute}]`)) {
      if (!matches.delete(item)) item.removeAttribute(attribute)
    }
    for (const item of matches) item.setAttribute(attribute, '')
  }

  function styleProfileActions(parent) {
    if (parent?.tagName === 'DIV') {
      parent.toggleAttribute(profileActions, Boolean(parent.querySelector(`:scope > ${userActions}`)))
    }
  }

  function styleDetailLayout(scope) {
    markMatches(scope, detailLayout, 'data-better-x-post-layout')
    markMatches(scope, `${detailLayout} > div:has(> [role="group"])`, 'data-better-x-actions-row')
    markMatches(scope, `${detailLayout} > div:last-child:not(:has([role="group"]))`, 'data-better-x-post-tools')
  }

  function isReplySortMenu(menu, firstItem) {
    for (let row = firstItem; row && row !== menu; row = row.parentElement) {
      for (let heading = row.previousElementSibling; heading; heading = heading.previousElementSibling) {
        if (/^sort\s+replies$/i.test(heading.textContent.trim())) return true
      }
    }
    return false
  }

  function styleMenus() {
    for (const menu of menus || document.querySelectorAll(menuSelector)) {
      if (!root.contains(menu)) continue
      const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], a[role="link"]')
      menu.toggleAttribute('data-better-x-reply-sort', isReplySortMenu(menu, items[0]))
      for (const item of items) {
        item.toggleAttribute('data-better-x-handle', item.textContent.includes('@'))
      }
      markMatches(menu, menuHeadingSelector, 'data-better-x-menu-heading')
    }
  }

  function update() {
    frame = 0
    if (nativeSearch && (!nativeSearch.form.isConnected || nativeSearch.url !== location.href)) closeNativeSearch()
    if (!pending) {
      markMatches(root, `div:has(> ${userActions})`, profileActions)
      markMatches(root, socialIconSelector, socialIcon)
      styleDetailLayout(root)
    }
    for (const group of pending || document.querySelectorAll(groupSelector)) {
      if (pending && (!root.contains(group) || !group.matches(groupSelector))) continue
      const text = summary(group)
      if (group.dataset.betterXSummary !== text) group.dataset.betterXSummary = text
    }
    pending = new Set()
    if (!menus) {
      styleMenus()
      menus = new Set()
    }
    const path = location.pathname
    if (!navigationChanged && path === currentPath) return
    navigationChanged = false
    currentPath = path
    for (const link of document.querySelectorAll(':is(header[role="banner"] nav, [data-testid="BottomBar"]) a[href^="/"]')) {
      const href = link.getAttribute('href')
      link.toggleAttribute('data-better-x-current', path === href || path.startsWith(`${href}/`))
    }
    const rail = document.querySelector('header[role="banner"] nav:not([data-testid="BottomBar"] *)')
    const post = rail?.closest('header')?.querySelector('[data-testid="SideNav_NewTweet_Button"]')
    mountSearch('rail', post?.parentElement || rail, post)
    mountSearch('compact', document.querySelector('[data-testid="BottomBar"] nav'))
  }

  function track(node, articles, detailPosts) {
    if (node.matches('article')) articles.add(node)
    if (node.matches(detailSelector)) detailPosts.add(node)
    if (node.matches(groupSelector)) pending.add(node)
    if (node.matches(menuSelector)) menus.add(node)
    if (node.matches(navigationSelector)) navigationChanged = true
    if (node.matches(userActions)) styleProfileActions(node.parentElement)
    if (node.hasAttribute(profileActions)) styleProfileActions(node)
  }

  function queueUpdate() {
    frame ||= requestAnimationFrame(update)
  }

  function opensModal(record) {
    if (record.type === 'attributes') {
      return record.target.matches(modalSelector) && record.target.checkVisibility({ checkVisibilityCSS: true })
    }
    for (const node of record.addedNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      if (node.matches(modalSelector) && node.checkVisibility({ checkVisibilityCSS: true })) return true
      for (const modal of node.querySelectorAll(modalSelector)) {
        if (modal.checkVisibility({ checkVisibilityCSS: true })) return true
      }
    }
    return false
  }

  const observer = new MutationObserver(records => {
    if (nativeSearch && records.some(opensModal)) closeNativeSearch()
    if (!pending) return
    const articles = new Set()
    const detailPosts = new Set()
    for (const record of records) {
      const target = record.target
      const element = target.nodeType === 1 ? target : target.parentElement
      if (record.attributeName === 'tabindex') {
        if (element.matches('article')) detailPosts.add(element)
        continue
      }
      const menu = element?.closest(menuSelector)
      if (menu) menus.add(menu)
      if (record.type !== 'characterData' && element?.closest(navigationSelector)) navigationChanged = true
      let group = element?.closest(groupSelector)
      while (group) {
        pending.add(group)
        group = group.parentElement?.closest(groupSelector)
      }
      if (record.attributeName === 'data-testid' &&
          (element.matches(userActions) || element.parentElement?.hasAttribute(profileActions))) {
        styleProfileActions(element.parentElement)
      }
      if (record.type === 'childList' && element?.hasAttribute(profileActions)) styleProfileActions(element)

      const changedChildren = hasElements(record.addedNodes) || hasElements(record.removedNodes)
      if (changedChildren || record.attributeName === 'data-testid' || record.attributeName === 'role') {
        for (let article = element?.closest('article'); article; article = article.parentElement?.closest('article')) {
          if (changedChildren || record.attributeName === 'data-testid') articles.add(article)
          if ((changedChildren || record.attributeName === 'role') && article.matches(detailSelector)) detailPosts.add(article)
        }
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        track(node, articles, detailPosts)
        for (const child of node.querySelectorAll(observedSelector)) track(child, articles, detailPosts)
      }
    }
    for (const article of articles) {
      if (!article.isConnected) continue
      markMatches(article, socialIconSelector, socialIcon)
    }
    for (const article of detailPosts) {
      if (article.isConnected) styleDetailLayout(article)
    }
    if (menus.size) {
      styleMenus()
      menus.clear()
    }
    if (pending.size || navigationChanged || location.pathname !== currentPath ||
        (nativeSearch && !nativeSearch.form.isConnected)) queueUpdate()
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
      window.addEventListener('keydown', handleSearchKey, true)
      window.addEventListener('focusin', watchSearchResults, true)
      watchSearchResults({ target: document.activeElement })
      window.navigation?.addEventListener('currententrychange', queueUpdate)
      observer.observe(root, {
        childList: true, subtree: true, characterData: true,
        attributeFilter: ['role', 'data-testid', 'dir', 'data-slot', 'aria-modal', 'open', 'tabindex'],
      })
      queueUpdate()
      return
    }
    window.removeEventListener('keydown', handleSearchKey, true)
    window.removeEventListener('focusin', watchSearchResults, true)
    searchResultsObserver.disconnect()
    searchForm = undefined
    markProfileResult(undefined)
    window.navigation?.removeEventListener('currententrychange', queueUpdate)
    for (const button of searchButtons.values()) button.remove()
    closeNativeSearch()
    searchDialog?.close()
    observer.disconnect()
    pending = undefined
    menus = undefined
    navigationChanged = true
    cancelAnimationFrame(frame)
    frame = 0
  }

  new MutationObserver(sync).observe(root, { attributeFilter: ['data-better-x-quiet-requested'] })
  sync()
})()
