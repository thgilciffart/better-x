const form = document.querySelector('form')
const statusMessage = document.querySelector('#status')
const { defaults, linkDomain, load, navigation, normalize } = BetterXSettings
const accents = {
  Blue: '#1d9bf0', Yellow: '#ffd400', Pink: '#f91880', Purple: '#7856ff', Orange: '#ff7a00', Green: '#00ba7c',
}
const genericFonts = ['system-ui', 'sans-serif', 'serif', 'monospace']
const fonts = [...genericFonts]
let saved

chrome.fontSettings.getFontList().then(installed => {
  const seen = new Set(fonts)
  for (const { displayName } of installed) {
    if (!seen.has(displayName.toLowerCase())) fonts.push(displayName)
    seen.add(displayName.toLowerCase())
  }
}).catch(() => {})

const accent = form.elements.quietAccent
const custom = accent.closest('.custom')
const resetAccent = document.querySelector('#reset-accent')
resetAccent.addEventListener('click', () => save(accent, ''))
for (const [label, color] of Object.entries(accents)) {
  const swatch = document.createElement('button')
  swatch.type = 'button'
  swatch.className = 'swatch'
  swatch.value = color
  swatch.title = label
  swatch.setAttribute('aria-label', label)
  swatch.style.setProperty('--swatch', color)
  swatch.addEventListener('click', () => {
    accent.value = color
    accent.dispatchEvent(new Event('change', { bubbles: true }))
  })
  custom.before(swatch)
}

function fallback(input) {
  return String(defaults[input.name] ?? defaults.imageExport[input.name] ?? '')
}

for (const input of document.querySelectorAll('input[type="text"], input[type="number"]')) {
  const field = document.createElement('span')
  field.className = 'field'
  const revert = document.createElement('button')
  revert.type = 'button'
  revert.className = 'revert'
  revert.textContent = '↺'
  revert.title = 'Reset to default'
  revert.setAttribute('aria-label', 'Reset to default')
  revert.addEventListener('click', () => {
    input.value = fallback(input)
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  input.replaceWith(field)
  field.append(input, revert)
}

function syncControls() {
  for (const revert of document.querySelectorAll('.field .revert')) {
    revert.toggleAttribute('data-default', revert.previousElementSibling.value === fallback(revert.previousElementSibling))
  }
  const color = saved.quietAccent
  for (const swatch of document.querySelectorAll('.swatch')) {
    const selected = color && (swatch === custom ? !Object.values(accents).includes(color) : swatch.value === color)
    swatch.toggleAttribute('data-selected', Boolean(selected))
  }
  resetAccent.toggleAttribute('data-default', !color)
  custom.style.setProperty('--swatch', color)
  for (const [key, size] of Object.entries({ quietWidth: 600, quietUiSize: 14, quietSize: 15 })) {
    form.elements[key].placeholder = saved.quiet ? String(size) : 'Default'
  }
}

const font = form.elements.quietFont
const fontList = document.querySelector('#quiet-fonts')

function chooseFont(name) {
  font.value = name
  font.dispatchEvent(new Event('change', { bubbles: true }))
  font.blur()
}

function showFonts(query = '') {
  const match = query.trim().toLowerCase()
  fontList.replaceChildren(...fonts.filter(name => name.toLowerCase().includes(match)).map(name => {
    const option = document.createElement('div')
    option.setAttribute('role', 'option')
    option.setAttribute('aria-selected', String(name === font.value))
    option.textContent = name
    option.style.fontFamily = genericFonts.includes(name) ? name : `"${name}", system-ui`
    return option
  }))
  fontList.hidden = !fontList.childElementCount
  font.setAttribute('aria-expanded', String(!fontList.hidden))
  fontList.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
}

function hideFonts() {
  fontList.hidden = true
  font.setAttribute('aria-expanded', 'false')
}

font.addEventListener('focus', () => showFonts())
font.addEventListener('input', () => showFonts(font.value))
font.addEventListener('blur', hideFonts)
fontList.addEventListener('pointerdown', event => event.preventDefault())
fontList.addEventListener('click', ({ target }) => {
  const option = target.closest('[role="option"]')
  if (option) chooseFont(option.textContent)
})
font.addEventListener('keydown', event => {
  const options = [...fontList.children]
  const active = fontList.querySelector('.active')
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (fontList.hidden) return showFonts()
    const step = event.key === 'ArrowDown' ? 1 : -1
    const next = options[(options.indexOf(active) + step + options.length) % options.length]
    active?.classList.remove('active')
    next?.classList.add('active')
    next?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter' && active && !fontList.hidden) {
    event.preventDefault()
    chooseFont(active.textContent)
  } else if (event.key === 'Escape' && !fontList.hidden) {
    event.preventDefault()
    hideFonts()
  }
})

const navigationItems = document.querySelector('#navigation-items')
for (const [key, label] of Object.entries(navigation)) {
  const row = document.createElement('label')
  row.className = 'row'
  const control = document.createElement('input')
  control.type = 'checkbox'
  control.name = `nav:${key}`
  control.setAttribute('role', 'switch')
  row.append(label, control)
  navigationItems.append(row)
}

const tabs = Array.from(document.querySelectorAll('[role="tab"]'))
function selectTab(selected) {
  for (const tab of tabs) {
    const active = tab === selected
    tab.setAttribute('aria-selected', String(active))
    tab.tabIndex = active ? 0 : -1
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active
  }
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => selectTab(tab))
  tab.addEventListener('keydown', event => {
    const target = {
      ArrowLeft: tabs.at(index - 1),
      ArrowRight: tabs[(index + 1) % tabs.length],
      Home: tabs[0],
      End: tabs.at(-1),
    }[event.key]
    if (!target) return
    event.preventDefault()
    selectTab(target)
    target.focus()
  })
}

function report(message) {
  statusMessage.textContent = message
  statusMessage.hidden = !message
}

function setValue(control, value) {
  if (control.type === 'checkbox') control.checked = value
  else if (control === accent) control.value = value || accents.Blue
  else control.value = value
}

async function hydrate() {
  saved = await load()
  for (const [key, value] of Object.entries(saved)) {
    if (form.elements[key]) setValue(form.elements[key], value)
  }
}

hydrate().then(() => {
  for (const group of form.querySelectorAll('fieldset')) group.disabled = false
  syncControls()
}).catch(() => report('Settings could not be loaded.'))

form.addEventListener('change', ({ target }) => {
  const { name } = target
  if (!target.checkValidity()) {
    target.reportValidity()
    setValue(target, saved[name])
    return
  }
  const value = name === 'linkHost' ? linkDomain(target.value) :
    target.type === 'checkbox' ? target.checked :
    normalize(name, target.type === 'number' && target.value ? Number(target.value) : target.value)
  if (name === 'linkHost' && value === null) {
    target.setAttribute('aria-invalid', 'true')
    report('Enter a domain like vxtwitter.com.')
    return
  }
  target.removeAttribute('aria-invalid')
  save(target, value)
})

async function save(target, value) {
  const { name } = target
  target.disabled = true
  try {
    await chrome.storage.local.set({ [name]: value })
    saved[name] = value
    setValue(target, value)
    report('')
  } catch {
    setValue(target, saved[name])
    report('That change could not be saved.')
  } finally {
    target.disabled = false
    syncControls()
  }
}

form.addEventListener('submit', event => {
  event.preventDefault()
  document.activeElement?.blur()
})
