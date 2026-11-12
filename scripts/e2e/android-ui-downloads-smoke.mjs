import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.env.LYRIC_TEST_URL||'http://127.0.0.1:5177/';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:412,height:915},isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
 window.CapacitorCustomPlatform={name:'android'};
 window.__downloads=[{taskId:'1',songInfo:{id:1,name:'Midnight — 离线音乐',ar:[{name:'HaruMusic'}],picUrl:'/icon.png'},filename:'Midnight.flac',state:'completed',total:24500000,loaded:24500000,progress:100,createdAt:3},{taskId:'2',songInfo:{id:2,name:'正在下载的音乐',ar:[{name:'Artist'}],picUrl:'/icon.png'},state:'downloading',total:20000000,loaded:8000000,progress:40,createdAt:2},{taskId:'3',songInfo:{id:3,name:'可以重试的任务',ar:[],picUrl:'/icon.png'},state:'error',error:'网络连接中断，请重试',progress:0,createdAt:1}];
 window.Capacitor={nativeCallback:()=> 'stub-listener',PluginHeaders:[{name:'HaruMedia',methods:[{name:'update',rtype:'promise'},{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'promise'}]},{name:'HaruDownloads',methods:['list','remove','openFolder','enqueue','playbackFile'].map(name=>({name,rtype:'promise'}))}],nativePromise:async(plugin,method,options)=>{if(plugin==='HaruDownloads'){if(method==='list')return {tasks:window.__downloads};if(method==='remove'){window.__downloads=window.__downloads.filter(t=>t.taskId!==options.taskId);return {};}return {};}return {};}};
});
await context.route('http://127.0.0.1:30488/**',route=>{const url=route.request().url();const artists=Array.from({length:24},(_,i)=>({id:i+1,name:'艺人 '+(i+1),picUrl:base+'resources/icon.png',albumSize:12}));return route.fulfill({json:url.includes('__health')?{service:'harumusic'}:url.includes('/artist/list')?{code:200,artists,more:false}:{code:200,data:[],albums:[],artists:[],result:{songs:[]}}});});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base,{waitUntil:'domcontentloaded'});
await page.locator('.startup-intro').waitFor({timeout:20000});
await page.evaluate(()=>document.querySelector('.startup-intro').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=a.effect.target.classList.contains('intro-mark')?350:0;}));
mkdirSync('artifacts/ui-0.1.12',{recursive:true});await page.screenshot({path:'artifacts/ui-0.1.12/startup.png'});
await page.locator('.intro-skip').click();await page.locator('.startup-intro').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.getElementById('app').inert),false);
await page.getByText('我已阅读并同意',{exact:true}).click();await page.getByText('我已阅读并同意',{exact:true}).waitFor({state:'detached'});
await page.goto(base+'#/downloads');await page.waitForSelector('.download-list li').catch(async e=>{console.log('DEBUG',await page.evaluate(()=>({text:document.body.innerText,platform:window.Capacitor?.getPlatform(),headers:window.Capacitor?.PluginHeaders,records:window.__downloads})),errors);await page.screenshot({path:'artifacts/android-download-ui-debug.png'});throw e;});
assert.equal(await page.locator('.download-list li').count(),3);await page.waitForTimeout(500);
mkdirSync('artifacts/ui-0.1.12',{recursive:true});await page.screenshot({path:'artifacts/ui-0.1.12/downloads-light.png'});
const sizes=await page.locator('.android-downloads button').evaluateAll(elements=>elements.filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getBoundingClientRect().height));assert.ok(sizes.every(h=>h>=44));
await page.getByRole('tab',{name:'已完成'}).click();assert.equal(await page.locator('.download-list li').count(),1);
await page.getByRole('button',{name:'删除下载文件'}).click();await page.getByText('保留',{exact:true}).click();await page.getByText('删除下载文件？',{exact:true}).waitFor({state:'detached'});assert.equal(await page.locator('.download-list li').count(),1);
await page.setViewportSize({width:320,height:740});await page.evaluate(async()=>{const url=performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/store/modules/settings.ts');const {useSettingsStore}=await import(url||'/store/modules/settings.ts');useSettingsStore().theme='dark';document.documentElement.classList.add('dark');});await page.waitForTimeout(300);await page.screenshot({path:'artifacts/ui-0.1.12/downloads-small-dark.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>sessionStorage.removeItem('haru-intro-seen'));await page.reload();await page.waitForSelector('.android-downloads');assert.equal(await page.locator('.startup-intro').count(),0);assert.equal(await page.evaluate(()=>document.getElementById('app').inert),false);
await page.setViewportSize({width:412,height:915});
await page.evaluate(()=>document.documentElement.style.setProperty('--safe-area-inset-top','24px'));
for(const path of ['/artists','/mobile-search','/set','/history','/downloads']) {
 await page.goto(base+'#'+path);await page.waitForTimeout(450);
 const geometry=await page.evaluate(()=>{const h=document.querySelector('.mobile-header').getBoundingClientRect();const c=document.querySelector('.mobile-content').getBoundingClientRect();return {headerBottom:h.bottom,contentTop:c.top,contentBottom:c.bottom};});
 assert.equal(geometry.contentTop,0,path+' viewport must extend beneath the floating header');
 const bodyTop=await page.locator('.mobile-edge-body').first().evaluate(e=>parseFloat(getComputedStyle(e).paddingTop));
 assert.ok(bodyTop>=96,path+' must inset initial content inside the scroll host');
 assert.ok(geometry.contentBottom<=916,path+' scroll viewport must stay inside the window');
 if(path==='/artists') {await page.locator('.artists-page .n-scrollbar-container').evaluate(e=>e.scrollTop=300);await page.waitForTimeout(450);assert.equal(await page.locator('.mobile-header').evaluate(e=>getComputedStyle(e).opacity),'0');await page.screenshot({path:'artifacts/ui-0.1.12/header-artists-scrolled.png'});}
}
await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(base+'#/');await page.waitForSelector('.liquid-tab-slider');
await page.evaluate(async()=>{
 window.__loadTestModule=path=>import(performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname===path).at(-1)?.name||path);
 const {usePlayerCoreStore}=await window.__loadTestModule('/store/modules/playerCore.ts');
 usePlayerCoreStore().playMusic={id:'visual-fixture',source:'local',name:'Glass / 浮光',ar:[{name:'HaruMusic'}],picUrl:'/icon.png'};
 // Deliberately colorful content lets the screenshot show transmitted colors below both pills.
 const content=document.querySelector('.n-scrollbar-content');
 const canvas=document.createElement('div');canvas.className='glass-test-content';
 canvas.style.cssText='height:1800px;background:linear-gradient(180deg,#abc8da,#e9c8be 45%,#78b9b3 70%,#b9bdce);border-radius:24px;margin:0 16px';
 content.replaceChildren(canvas);
});
await page.waitForSelector('.mobile-mini-controls');await page.waitForTimeout(300);
const glass=await page.evaluate(()=>{
 const header=document.querySelector('.mobile-header'),content=document.querySelector('.mobile-content');
 return {headerBackground:getComputedStyle(header).backgroundColor,headerImage:getComputedStyle(header).backgroundImage,
 content:content.getBoundingClientRect().toJSON(),after:getComputedStyle(content,'::after').content,
 mini:getComputedStyle(document.querySelector('.mobile-mini-controls')).backgroundColor,
 nav:getComputedStyle(document.querySelector('.mobile-bottom-menu')).backgroundColor,
 inner:getComputedStyle(document.querySelector('.app-menu.android-hig-tabs')).backgroundColor};
});
assert.equal(glass.headerBackground,'rgba(0, 0, 0, 0)');assert.equal(glass.headerImage,'none');
assert.ok(['none','normal'].includes(glass.after));assert.equal(glass.inner,'rgba(0, 0, 0, 0)');
assert.ok(glass.mini.endsWith('0.26)') || glass.mini==='rgba(0, 0, 0, 0)');
assert.equal(glass.content.top,0);assert.equal(glass.content.bottom,915);
await page.locator('.mobile-edge-scroll').evaluate(e=>e.scrollTop=420);await page.waitForTimeout(450);
await page.screenshot({path:'artifacts/ui-0.1.12/floating-glass.png'});
const links=page.locator('.android-hig-tabs .app-menu-item-link');
const rects=await links.evaluateAll(es=>es.map(e=>({href:e.getAttribute('href'),r:e.getBoundingClientRect().toJSON()})));
assert.ok(rects.length>=4);
const x0=rects[0].r.x+rects[0].r.width/2,y=rects[0].r.y+rects[0].r.height/2;
const x2=rects[2].r.x+rects[2].r.width/2;
const slider=page.locator('.liquid-tab-slider');
await page.mouse.move(x0,y);await page.mouse.down();await page.mouse.move(x2,y,{steps:12});
assert.ok(await slider.evaluate(e=>e.classList.contains('is-dragging')));
const deform=await slider.evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a);
assert.ok(deform>1.01,'lens stretches while dragged');
await page.screenshot({path:'artifacts/ui-0.1.12/slider-drag.png'});
await page.mouse.up();await page.waitForTimeout(950);
assert.ok(page.url().endsWith(rects[2].href),'release navigates to target tab');
const settle=await slider.evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a);
assert.ok(Math.abs(settle-1)<0.002,'lens springs back to its original shape');
// Interrupt a returning spring, then drag right to left.
await links.nth(0).click();await page.waitForTimeout(40);
await page.mouse.move(x2,y);await page.mouse.down();await page.mouse.move(x0,y,{steps:8});await page.mouse.up();await page.waitForTimeout(950);
assert.ok(page.url().endsWith(rects[0].href),'a new gesture can interrupt and reverse the spring');
// Android WebView uses touch pointers: verify the real touch dispatch path too.
const cdp=await context.newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]});
for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x2-x0)*i/8,y}]});
assert.ok(await slider.evaluate(e=>e.classList.contains('is-dragging')),'touch must drag the lens');
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(950);
assert.ok(page.url().endsWith(rects[2].href));
await links.nth(0).click();await page.waitForTimeout(500);
// Pointer cancellation returns to the current tab without navigation.
const beforeCancel=page.url();
await page.dispatchEvent('.android-hig-tabs .app-menu-list','pointerdown',{pointerId:91,isPrimary:true,button:0,clientX:x0,clientY:y});
await page.dispatchEvent('.android-hig-tabs .app-menu-list','pointercancel',{pointerId:91,isPrimary:true});
assert.equal(page.url(),beforeCancel);
await page.emulateMedia({reducedMotion:'reduce'});await links.nth(1).click();await page.waitForTimeout(150);
assert.ok(Math.abs(await slider.evaluate(e=>new DOMMatrix(getComputedStyle(e).transform).a)-1)<0.002);
await page.setViewportSize({width:320,height:740});await page.waitForTimeout(250);
assert.ok(await slider.evaluate(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;}));
assert.deepEqual(errors,[]);console.log('Android UI passed: edge-to-edge scroll on 5 routes, transparent floating surfaces, interruptible spring, mouse and touch swipes, cancellation, resize, reduced motion, downloads and touch targets.');
await browser.close();
