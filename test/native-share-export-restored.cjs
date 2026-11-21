const assert=require('node:assert/strict')
const {chromium}=require('playwright-core')
const extension=process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const fixture=`<!doctype html><meta charset="utf-8">
<article><a href="/demo/status/42"><time datetime="2026-01-01">Today</time></a>
<div data-testid="User-Name"><a href="/demo">Demo</a></div><div data-testid="tweetText">Hello</div>
<button data-testid="share">Share</button><button data-testid="caret">More</button><img width=100 height=50 src="https://pbs.twimg.com/media/test.jpg"></article>
<div id="layers"><div role="menu" aria-hidden="true" hidden><button role="menuitem">Copy link</button></div></div>
<script>
let shares=0
window.interactions=[]
document.addEventListener('click',event=>{
 if(!event.isTrusted)return
 const action=event.target.closest('button')?.dataset.testid
 if(action==='share'){
   interactions.push('share')
   if(++shares===1){
     const menu=layers.firstElementChild
     menu.hidden=false
     menu.removeAttribute('aria-hidden')
   }else{
     layers.innerHTML='<div role="menu"><button role="menuitem">Send via chat</button><button role="menuitem">Loading link</button></div>'
     setTimeout(()=>layers.querySelector('button:last-child').firstChild.data='Copy link',60)
   }
 }
 if(action==='caret'){
  interactions.push('more')
  layers.innerHTML='<div role="menu"><button role="menuitem">Copy link</button><button role="menuitem">Report</button></div>'
 }
})
document.addEventListener('contextmenu',event=>{
 if(event.target.tagName==='IMG'){event.preventDefault();interactions.push('native media')}
})
</script>`
;(async()=>{
 const ctx=await chromium.launchPersistentContext('',{channel:'chromium',args:['--load-extension='+extension,'--disable-extensions-except='+extension]})
 try {
  const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker')
  const page=await ctx.newPage()
  page.setDefaultTimeout(6500)
  const errors=[]
  page.on('pageerror',error=>errors.push(error.message))
  await ctx.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://x.com'})
  await ctx.route('https://x.com/**',route=>route.fulfill({contentType:'text/html',body:fixture}))
  await ctx.route('https://pbs.twimg.com/**',route=>route.fulfill({contentType:'image/svg+xml',headers:{'access-control-allow-origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>'}))
  for(const quiet of [false,true]){
   await worker.evaluate(quiet=>chrome.storage.local.set({quiet,copyImage:true,downloads:true}),quiet)
   await page.goto('https://x.com/home')
   await page.waitForFunction(quiet=>document.documentElement.dataset.betterXQuiet===String(quiet),quiet)
   const share=page.getByRole('button',{name:'Share',exact:true})
   const exportRow=page.getByRole('menuitem',{name:'Copy as image'})
   await share.click()
   await exportRow.waitFor()
   assert.equal(await page.locator('.better-x-menu').count(),0)
   await page.evaluate(()=>layers.replaceChildren())
   await share.click()
   await exportRow.waitFor()
   assert.equal(await exportRow.count(),1)
   await exportRow.click()
   await page.getByText('Copied post image',{exact:true}).waitFor()
   assert.equal(await page.evaluate(async()=>{
    const items=await navigator.clipboard.read()
    const png=items.find(item=>item.types.includes('image/png'))
    return Boolean(png && (await png.getType('image/png')).size)
   }),true)
   await page.getByRole('button',{name:'More',exact:true}).click()
   await page.getByRole('menuitem',{name:'Report'}).waitFor()
   assert.equal(await exportRow.count(),0)
   await page.locator('img').click({button:'right'})
   await page.locator('.better-x-menu:popover-open').getByRole('menuitem',{name:'Download image'}).waitFor()
   assert.deepEqual(await page.evaluate(()=>interactions),['share','share','more'])
  }
  await worker.evaluate(()=>chrome.storage.local.set({copyImage:false}))
  await page.reload()
  await page.getByRole('button',{name:'Share',exact:true}).click()
  assert.equal(await page.getByRole('menuitem',{name:'Copy as image'}).count(),0)
  assert.deepEqual(errors,[])
  console.log('PASS: native Share exports a PNG, delayed and reused menu rows work, and More stays native while photo actions return')
 }finally{await ctx.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
