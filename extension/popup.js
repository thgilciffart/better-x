const form = document.querySelector('form')
const statusMessage = document.querySelector('#status')
const { load, navigation } = BetterXSettings
const saving = new Set()
let saved

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

function updateLinkDomain() {
  form.elements.linkHost.disabled = saving.has('linkHost') || !form.elements.cleanLinks.checked
}

function report(message) {
  statusMessage.textContent = message
  statusMessage.hidden = !message
}

function setValue(control, value) {
  if (control.type === 'checkbox') control.checked = value
  else control.value = value
}

async function hydrate() {
  saved = await load()
  for (const [key, value] of Object.entries(saved)) {
    if (form.elements[key]) setValue(form.elements[key], value)
  }
  updateLinkDomain()
}

hydrate().then(() => {
  for (const group of form.querySelectorAll('fieldset')) group.disabled = false
}).catch(() => report('Settings could not be loaded.'))

form.addEventListener('change', async ({ target }) => {
  const { name } = target
  const value = target.type === 'checkbox' ? target.checked : target.value
  saving.add(name)
  target.disabled = true
  updateLinkDomain()
  try {
    await chrome.storage.local.set({ [name]: value })
    saved[name] = value
    report('')
  } catch {
    setValue(target, saved[name])
    report('That change could not be saved.')
  } finally {
    saving.delete(name)
    target.disabled = false
    updateLinkDomain()
  }
})
