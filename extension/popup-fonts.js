(() => {
  const { emojiFonts } = BetterXSettings
  const { author, homepage_url: homepage, version } = chrome.runtime.getManifest()
  const about = document.querySelector('#about')
  const aboutTab = document.querySelector('#about-tab')
  const select = document.querySelector('#emoji-font')
  const clear = document.querySelector('#clear-fonts')
  const storageEmoji = document.querySelector('#storage-emoji')
  const storageImage = document.querySelector('#storage-image')
  const storageTotal = document.querySelector('#storage-total')
  const storageStatus = document.querySelector('#font-storage-status')
  const selectionStatus = document.querySelector('#emoji-status')
  const libraryStatus = document.querySelector('#font-library-status')
  const sizeFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
  let state
  let pending

  document.querySelector('#about-author').textContent = author
  document.querySelector('#about-version').textContent = version
  document.querySelector('#about-repo').href = homepage
  document.querySelector('#manage-fonts').addEventListener('click', () => {
    aboutTab.click()
    aboutTab.focus()
  })

  const template = document.querySelector('#emoji-download-row')
  const list = document.querySelector('#emoji-downloads')
  const rows = Object.entries(emojiFonts).filter(([font]) => font).map(([font, label]) => {
    const row = template.content.firstElementChild.cloneNode(true)
    const meta = row.querySelector('.font-download-meta')
    const button = row.querySelector('button')
    row.querySelector('.font-name').textContent = label
    button.title = `Download ${label}`
    button.setAttribute('aria-label', button.title)
    button.addEventListener('click', () => request('emoji-download', font, `Downloading ${label}`))
    list.append(row)
    return { font, label, meta, button }
  })

  function formatBytes(bytes) {
    if (bytes < 1000) return `${bytes}\u00A0B`
    if (bytes < 1000000) return `${sizeFormat.format(bytes / 1000)}\u00A0KB`
    return `${sizeFormat.format(bytes / 1000000)}\u00A0MB`
  }

  function report(status, message) {
    status.textContent = message
    status.hidden = !message
  }

  function render() {
    const options = [new Option(emojiFonts[''], '')]
    let emojiBytes = 0
    for (const { font, label, meta, button } of rows) {
      const entry = state?.fonts[font]
      if (entry?.downloaded) {
        options.push(new Option(label, font))
        emojiBytes += entry.size
      }
      meta.textContent = entry?.downloaded ? 'Downloaded' : entry ? formatBytes(entry.size) : ''
      meta.toggleAttribute('data-downloaded', Boolean(entry?.downloaded))
      button.hidden = Boolean(entry?.downloaded)
      button.disabled = Boolean(pending) || !entry
    }
    select.replaceChildren(...options)
    select.value = state?.selected ?? ''
    select.disabled = Boolean(pending) || options.length === 1
    const storage = state?.storage
    const placeholder = pending ? 'Loading' : 'Unavailable'
    clear.disabled = Boolean(pending) || !storage || emojiBytes + storage.imageFonts === 0
    storageEmoji.textContent = state ? formatBytes(emojiBytes) : placeholder
    storageImage.textContent = storage ? formatBytes(storage.imageFonts) : placeholder
    storageTotal.textContent = storage ? formatBytes(storage.settings + emojiBytes + storage.imageFonts) : placeholder
  }

  async function request(type, font, message = '') {
    if (pending) return
    const status = about.hidden ? selectionStatus : type === 'fonts-clear' ? storageStatus : libraryStatus
    report(status, message)
    pending = chrome.runtime.sendMessage({ type, font, storage: !about.hidden })
    render()
    try {
      const result = await pending
      if (!result?.fonts) throw new Error(result?.error)
      state = { ...state, ...result }
      report(status, type === 'fonts-clear' ? 'Font caches cleared.' : '')
    } catch (error) {
      report(status, error.message || 'Could not load the font library. Reopen the popup to try again.')
    } finally {
      pending = undefined
      render()
    }
  }

  select.addEventListener('change', () => request('emoji-select', select.value))
  clear.addEventListener('click', () => request('fonts-clear', '', 'Clearing font caches'))
  new MutationObserver(async () => {
    if (pending) await pending.catch(() => {})
    if (!about.hidden) request('emoji-library')
  }).observe(about, { attributeFilter: ['hidden'] })
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, 'emojiFont')) request('emoji-library')
  })
  request('emoji-library')
})()
