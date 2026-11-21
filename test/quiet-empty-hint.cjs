const assert=require('node:assert/strict')
const {chromium}=require('playwright-core')
const extension=process.env.BETTER_X_EXTENSION || require('node:path').join(__dirname, '..', 'extension')
const form=`<form role="search"><div><div data-testid="SearchBox_Search_Input_label"><input data-testid="SearchBox_Search_Input" role="combobox" placeholder="Search"></div></div>
<div><div id="typeaheadDropdown-1"><div data-testid="typeaheadEmptySearch" style="padding-block:20px 12px;text-align:center">Try searching for people, lists, or keywords</div></div></div></form>`
const fixture=inline=>`<!doctype html><html data-theme="light"><header role="banner"><nav><a href="/home">Home</a></nav></header>
<main role="main">${inline?form:'<aside data-testid="sidebarColumn">'+form+'</aside>'}</main>`
;(async()=>{
 const ctx=await chromium.launchPersistentContext('',{channel:'chromium',args:['--load-extension='+extension,'--disable-extensions-except='+extension]})
 try{
  const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker')
  await worker.evaluate(()=>chrome.storage.local.set({quiet:true}))
  await ctx.route('https://x.com/**',route=>route.fulfill({contentType:'text/html',body:fixture(route.request().url().endsWith('/explore'))}))
  const page=await ctx.newPage()
  for(const path of ['home','explore']){
   await page.goto('https://x.com/'+path)
   await page.waitForFunction(()=>document.documentElement.dataset.betterXQuiet==='true')
   if(path==='home'){
    await page.keyboard.press('/')
    await page.locator('form:popover-open').waitFor()
   }
   const hint=page.getByText('Try searching for people, lists, or keywords')
   await hint.waitFor()
   const measured=await hint.evaluate(el=>{
    const y=el.getBoundingClientRect().top
    const translate=getComputedStyle(el).translate
    el.style.translate='none'
    const delta=Math.round(el.getBoundingClientRect().top-y)
    el.style.removeProperty('translate')
    return {translate,delta}
   })
   assert.deepEqual(measured,{translate:'0px -4px',delta:4})
  }
  console.log('PASS: the hint sits 4 px higher in both the search popover and Explore search')
 }finally{await ctx.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
