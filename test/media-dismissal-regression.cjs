const assert = require('node:assert/strict')
const { chromium } = require('playwright-core')
const extension = process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const fixture = `<!doctype html><html data-theme="light"><style>
body { background: white }
#blank { position: fixed; right: 20px; top: 20px; padding: 12px }
article{width:240px;position:relative}
img{display:block;width:160px;height:80px}
video{display:block;width:160px;height:80px}
.overlay{position:absolute;left:10px;top:30px;width:110px;height:40px}
#native{position:fixed;left:10px;top:10px;animation:native-open 200ms both}
@keyframes native-open{0%{transform:scale(0.5)}50%{transform:scale(1.2)}100%{transform:scale(1)}}
</style>
<button id="outside">Outside</button>
<div id="blank">Empty area</div>
<main>
<article id="photo"><a href="/demo/status/42"><time>Today</time><img src="https://pbs.twimg.com/media/demo.jpg"></a><button id="cover" class="overlay" hidden>Overlay</button></article>
<article id="plain"><img src="https://pbs.twimg.com/media/plain.jpg"></article>
<article id="clip"><a href="/demo/status/43"><time>Today</time></a><video src="https://video.twimg.com/amplify_video/43/vid/720/demo.mp4"></video></article>
</main>
<dialog id="viewer"><img src="https://pbs.twimg.com/media/other.jpg"></dialog>
<div id="layers"></div>
<script>
window.nativeOpened=0
window.escapes=0
window.outsideClicks=0
document.addEventListener('click',event=>{
  if(event.target.closest('#photo a')) {
    event.preventDefault()
    window.outsideClicks++
  }
  if(event.target.id==='blank') window.outsideClicks++
})
document.addEventListener('mousedown',event=>{
  if(event.target.id==='blank' || event.target.closest('#viewer')) event.preventDefault()
})
document.addEventListener('contextmenu',event=>{
  if(!event.target.closest('img, video, #cover')) return
  event.preventDefault()
  window.nativeOpened++
  layers.innerHTML='<div id="native" role="menu"><button role="menuitem">Copy photo link</button><button role="menuitem">Post photo</button></div>'
})
document.addEventListener('keydown',event=>{if(event.key==='Escape')window.escapes++})
</script></html>`
;(async()=>{
 const context=await chromium.launchPersistentContext('',{
   channel:'chromium',viewport:{width:1000,height:700},
   args:['--load-extension='+extension,'--disable-extensions-except='+extension],
 })
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker')
  await context.grantPermissions(['clipboard-read','clipboard-write'], { origin: 'https://x.com' })
  await context.route('https://x.com/**',r=>r.fulfill({contentType:'text/html',body:fixture}))
  await context.route('https://pbs.twimg.com/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="orange"/></svg>'}))
  await context.route('https://video.twimg.com/**',r=>r.abort())
  const page=await context.newPage()
  page.setDefaultTimeout(4500)
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  const menu=page.locator('.better-x-menu:popover-open')
  const expected=['Copy image','Copy image address','Open image in new tab','Download image']
  const photo=page.locator('#photo img')
  for(const quiet of [false,true]){
   await worker.evaluate(quiet=>chrome.storage.local.set({quiet,downloads:true}),quiet)
   await page.goto('https://x.com/home')
   await page.waitForFunction(flag=>document.documentElement.dataset.betterXQuiet===String(flag),quiet)
   const outside=page.locator('#outside')
   await outside.focus()
   await photo.click({button:'right'})
   await menu.waitFor()
   assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),expected)
   assert.equal(await menu.getByRole('menuitem').first().evaluate(el=>el===document.activeElement),true)
   assert.equal(await page.evaluate(()=>window.nativeOpened),0)
   const rendered=await menu.evaluate(el=>new Promise(resolve=>{
    const sample=[]
    const frame=()=>{
     const bounds=el.getBoundingClientRect()
     sample.push([bounds.width,bounds.height,el.getAnimations({subtree:true}).length])
     if(sample.length===8)resolve(sample)
     else requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
   }))
   assert.ok(rendered[0][0]>0&&rendered[0][1]>0)
   assert.deepEqual(rendered,new Array(8).fill([rendered[0][0],rendered[0][1],0]))
   await page.keyboard.press('ArrowDown')
   assert.equal(await menu.getByRole('menuitem',{name:'Copy image address'}).evaluate(el=>el===document.activeElement),true)
   await page.keyboard.press('End')
   assert.equal(await menu.getByRole('menuitem',{name:'Download image'}).evaluate(el=>el===document.activeElement),true)
   await page.keyboard.press('Escape')
   await menu.waitFor({state:'detached'})
   assert.equal(await page.evaluate(()=>document.activeElement === document.querySelector("#photo a")),true)
   assert.equal(await page.evaluate(()=>window.escapes),0)
   await photo.click({button:'right'})
   await menu.waitFor()
   await photo.click({position:{x:10,y:10}})
   assert.equal(await page.evaluate(()=>window.outsideClicks),1)
   assert.equal(await menu.count(),0,'clicking the image that opened the menu should dismiss it')
   await page.mouse.click(600,450)
   assert.equal(await page.evaluate(()=>document.activeElement===document.body),true)
   await page.locator('#plain img').click({button:'right'})
   await menu.waitFor()
   await page.locator('#blank').click()
   assert.equal(await page.evaluate(()=>window.outsideClicks),2)
   assert.equal(await menu.count(),0,'clicking outside should dismiss even when the page retains menu focus')
   await photo.click({button:'right'})
   await menu.getByRole('menuitem',{name:'Copy image address'}).click()
   assert.equal(await menu.count(),0)
   assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://pbs.twimg.com/media/demo.jpg')
   await photo.click({button:'right',modifiers:['Shift']})
   assert.equal(await menu.count(),0)
   assert.equal(await page.evaluate(()=>window.nativeOpened),1)
   await page.evaluate(()=>layers.replaceChildren())
   await page.evaluate(()=>document.getElementById('cover').hidden=false)
   await page.locator('#cover').click({button:'right'})
   await menu.waitFor()
   assert.deepEqual(await menu.getByRole('menuitem').allTextContents(),expected)
   await outside.click()
   await menu.waitFor({state:'detached'})
   await page.locator('video').click({button:'right'})
   await menu.getByRole('menuitem',{name:'Download video'}).waitFor()
   await page.keyboard.press('Escape')
   await page.evaluate(()=>document.querySelector('#viewer').showModal())
   await page.locator('#viewer img').click({button:'right'})
   await menu.waitFor()
   assert.equal(await menu.evaluate(el=>el.parentElement.id),'viewer')
   await page.locator('#viewer img').click({position:{x:10,y:10}})
   assert.equal(await menu.count(),0,'click in the modal viewer should dismiss the menu')
   await page.locator('#viewer img').click({button:'right'})
   await menu.waitFor()
   await page.keyboard.press('Escape')
   assert.equal(await page.locator('#viewer').evaluate(el=>el.open),true)
   await page.evaluate(()=>document.querySelector('#viewer').close())
   await page.evaluate(()=>document.getElementById('cover').hidden=true)
   await page.evaluate(()=>document.getElementById('photo').requestFullscreen())
   await photo.click({button:'right'})
   await menu.waitFor()
   assert.equal(await menu.evaluate(el=>el.parentElement===document.fullscreenElement),true)
   await photo.click({position:{x:10,y:10}})
   assert.equal(await menu.count(),0,'click on fullscreen media should dismiss the menu')
   assert.equal(await page.evaluate(()=>document.fullscreenElement?.id),'photo')
   await photo.click({button:'right'})
   await menu.waitFor()
   await page.evaluate(()=>document.exitFullscreen())
   await menu.waitFor({state:'detached'})
  }
  await worker.evaluate(()=>chrome.storage.local.set({downloads:false}))
  await page.reload()
  await photo.click({button:'right'})
  assert.equal(await menu.count(),0)
  assert.equal(await page.evaluate(()=>window.nativeOpened),1)
  assert.deepEqual(errors,[])
  console.log('PASS: timeline, photo viewer, overlay hit-testing, video and fullscreen use the same stable, unanimated menu with keyboard and native bypass')
 }finally{await context.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
