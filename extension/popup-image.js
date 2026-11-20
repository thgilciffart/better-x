(() => {
  const { normalize } = BetterXSettings
  const form = document.querySelector('#image-export-form')
  const scale = form.querySelector('#font-scale')
  const status = form.querySelector('[role="status"]')
  const controls = [...form.querySelectorAll('[name]')]
  let current
  let saved
  let writes = Promise.resolve()

  function report(message) {
    status.textContent = message
    status.hidden = !message
  }

  function render() {
    for (const control of controls) {
      if (control.type === 'checkbox') control.checked = current[control.name]
      else control.value = current[control.name]
    }
    scale.value = current.fontScale.toFixed(2) + '×'
  }

  function save(update) {
    const next = normalize('imageExport', { ...current, ...update })
    current = next
    render()
    writes = writes.then(async () => {
      try {
        await chrome.storage.local.set({ imageExport: next })
        saved = next
        report('')
      } catch {
        if (current === next) {
          current = saved
          render()
        }
        report('Image settings could not be saved.')
      }
    })
  }

  form.addEventListener('submit', event => event.preventDefault())
  form.addEventListener('change', ({ target }) => {
    if (!target.checkValidity()) {
      target.reportValidity()
      target.value = current[target.name]
      return
    }
    const value = target.type === 'checkbox' ? target.checked :
      ['width', 'fontScale', 'dpr'].includes(target.name) ? Number(target.value) : target.value
    save({ [target.name]: value })
  })

  form.elements.fontScale.addEventListener('input', ({ target }) => {
    scale.value = Number(target.value).toFixed(2) + '×'
  })
  chrome.storage.local.get('imageExport').then(({ imageExport }) => {
    current = saved = normalize('imageExport', imageExport)
    render()
    form.querySelector('fieldset').disabled = false
  }).catch(() => report('Image settings could not be loaded.'))
})()
