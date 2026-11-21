const { chromium } = require('playwright-core')
const assert = require('node:assert/strict')
const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const fixture = `<!doctype html>
<style>[role^="menuitem"] {display:flex} [role="menu"] {min-width:128px}</style>
<div id="layers"></div>
<script>
  const item = (label, selected, radio) =>
    '<div id="' + label.toLowerCase() + '" role="' + (radio ? 'menuitemradio' : 'menuitem') +
    '"' + (radio ? ' aria-checked="' + selected + '"' : '') + '><div dir="ltr">' + label +
    '</div>' + (!radio && selected ? '<div class="check"><svg aria-hidden="true"></svg></div>' : '') + '</div>'
  function mountMenu({ wrapped=false, radio=false, title='Sort replies', selected='Relevant' }={}) {
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const header = '<div class="heading"><span dir="ltr">' + title + '</span></div>'
    const rows = ['Relevant','Recent','Likes'].map(label => item(label, label === selected, radio)).join('')
    menu.innerHTML = wrapped ? '<div><div>' + header + '<div>' + rows + '</div></div></div>' : header + rows
    layers.replaceChildren(menu)
  }
  mountMenu()
</script>`
;(async () => {
  const ctx = await chromium.launchPersistentContext('', {
    channel:'chromium',
    args:['--load-extension='+extension,'--disable-extensions-except='+extension]
  })
  try {
    await ctx.route('https://x.com/**',route=>route.fulfill({contentType:'text/html',body:fixture}))
    const worker = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker')
    await worker.evaluate(()=>chrome.storage.local.set({quiet:true}))
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror',error=>errors.push(error.message))
    await page.goto('https://x.com/home')
    await page.waitForFunction(()=>document.documentElement.dataset.betterXQuiet==='true')
    const style = name => page.locator('#'+name).evaluate(el => {
      const label = getComputedStyle(el.firstElementChild)
      const marker = getComputedStyle(el,'::after')
      return {line:label.textDecorationLine, background:marker.backgroundColor, width:marker.width}
    })
    const dot = {line:'none',background:'rgb(29, 155, 240)',width:'5px'}
    const emptyDot = {line:'none',background:'rgba(0, 0, 0, 0)',width:'5px'}
    assert.deepEqual(await style('relevant'),dot,'direct reply menu')
    await page.evaluate(()=>mountMenu({wrapped:true}))
    assert.deepEqual(await style('relevant'),dot,'wrapped reply menu')
    assert.deepEqual(await style('recent'),emptyDot,'unselected entry')
    await page.evaluate(()=>mountMenu({wrapped:true,radio:true}))
    assert.deepEqual(await style('relevant'),dot,'radio reply menu')
    await page.evaluate(()=>{
      document.querySelector('#relevant').setAttribute('aria-checked','false')
      document.querySelector('#recent').setAttribute('aria-checked','true')
    })
    assert.deepEqual(await style('relevant'),emptyDot,'old selection')
    assert.deepEqual(await style('recent'),dot,'updated selection')
    await page.evaluate(()=>mountMenu({wrapped:true,title:'Other options'}))
    assert.equal((await style('relevant')).line,'underline','ordinary menus retain their existing indicator')
    assert.deepEqual(errors,[])
    console.log('PASS: direct and wrapped reply sort menus, native radio selection, ordinary menu styling')
  } finally {
    await ctx.close()
  }
})().catch(error=>{console.error(error);process.exitCode=1})
