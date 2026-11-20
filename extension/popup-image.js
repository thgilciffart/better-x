(() => {
  const { imagePresets, normalize, normalizeVariant } = BetterXSettings
  const form = document.querySelector('#image-export-form')
  const presets = form.querySelector('#image-presets')
  const variants = form.querySelector('#image-variants')
  const picker = form.querySelector('#image-preset')
  const scale = form.querySelector('#font-scale')
  const add = form.querySelector('#save-image-variant')
  const remove = form.querySelector('#remove-image-variant')
  const status = form.querySelector('[role="status"]')
  const controls = [...form.querySelectorAll('[name]')]
  let current
  let saved
  let writes = Promise.resolve()

  for (const [index, { label }] of imagePresets.entries()) {
    presets.append(new Option(label, 'preset:' + index))
  }

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
    const activeVariant = normalizeVariant(current)
    const custom = current.variants.findIndex(variant => Object.keys(activeVariant)
      .every(key => activeVariant[key] === variant[key]))
    const builtIn = imagePresets.findIndex(({ surface, width, dpr }) =>
      surface === current.surface && width === current.width && dpr === current.dpr && !current.expanded)
    variants.replaceChildren(...current.variants.map(({ width, dpr }, index) =>
      new Option(`Variant ${index + 1} · ${width} px · ${dpr}×`, 'custom:' + index)))
    variants.hidden = !current.variants.length
    picker.value = custom >= 0 ? 'custom:' + custom : builtIn >= 0 ? 'preset:' + builtIn : ''
    add.disabled = custom >= 0
    remove.hidden = custom < 0
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
    if (target === picker) {
      const [type, index] = picker.value.split(':')
      save(type === 'custom' ? current.variants[index] : { ...imagePresets[index], expanded: false })
      return
    }
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
  add.addEventListener('click', () => save({ variants: [...current.variants, normalizeVariant(current)] }))
  remove.addEventListener('click', () => {
    const [, index] = picker.value.split(':')
    save({ variants: current.variants.filter((_, position) => position !== Number(index)) })
  })

  chrome.storage.local.get('imageExport').then(({ imageExport }) => {
    current = saved = normalize('imageExport', imageExport)
    render()
    form.querySelector('fieldset').disabled = false
  }).catch(() => report('Image settings could not be loaded.'))
})()
