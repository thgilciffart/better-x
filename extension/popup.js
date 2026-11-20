const form = document.querySelector('form')
const statusMessage = document.querySelector('#status')
const { load } = BetterXSettings
const saving = new Set()
let saved

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
    setValue(form.elements[key], value)
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
