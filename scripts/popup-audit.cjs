const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/24656/AppData/Local/Temp/haru-ui-tests/node_modules/playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1024,height:768}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('disclaimer_agreed_timestamp',String(Date.now()));localStorage.setItem('haru-liquid-mode','true');const ipcRenderer={send:()=>{},sendSync:channel=>channel==='get-platform'?'win32':{},invoke:async()=>null,on:()=>()=>{},removeAllListeners:()=>{}};window.electron={ipcRenderer};window.api=new Proxy({}, {get:(_target,name)=>String(name).startsWith('on')?()=>()=>{}:()=>Promise.resolve(name==='invoke'?[]:false)});});
 await page.goto('http://127.0.0.1:5191/#/set');await page.getByRole('button',{name:'关闭 Liquid Glass'}).waitFor();
 for(let i=0;i<2;i++) {await page.getByRole('button',{name:'设置Cookie',exact:true}).click();await page.locator('.n-dialog').waitFor();const glass=await page.locator('.n-dialog').evaluate(el=>({radius:getComputedStyle(el).borderRadius,blur:getComputedStyle(el).backdropFilter}));assert.equal(glass.radius,'24px');assert.match(glass.blur,/blur\(28px\)/);await page.keyboard.press('Escape');await page.locator('.n-dialog').waitFor({state:'hidden'});}
 await page.evaluate(async()=>{const {usePlayerStore}=await import('/store/modules/player.ts');const h=await import('/hooks/MusicHook.ts');const p=usePlayerStore();if(!h.playMusic)h.initMusicHook(p);p.setPlayMusic({id:1,name:'测试',picUrl:'',ar:[],al:{}});});
 await page.getByRole('button',{name:'音量与更多播放控制'}).click();
 await page.getByRole('button',{name:'自适应音质'}).click();await page.getByText('自适应最高可用音质',{exact:true}).waitFor();const popupGlass=await page.locator('.n-popover-shared').filter({has:page.locator('.quality-popover')}).evaluate(el=>({radius:getComputedStyle(el).borderRadius,blur:getComputedStyle(el).backdropFilter}));assert.equal(popupGlass.radius,'24px');assert.match(popupGlass.blur,/blur\(28px\)/);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'音量与更多播放控制'}).click();
 await page.getByRole('button',{name:'高级播放设置'}).click();
 console.log('Menu:', await page.locator('.n-dropdown-option-body__label').allTextContents());
 await page.locator('.n-dropdown-option-body__label').filter({hasText:'均衡器'}).click();await page.locator('.eq-modal-content').waitFor();
 const box=await page.locator('.eq-modal-content').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=1025&&box.y+box.height<=769);
 await page.keyboard.press('Escape');await page.locator('.eq-modal-content').waitFor({state:'hidden'});assert.deepEqual(errors,[]);
 console.log('PASS: repeated cookie dialog close, quality popover, advanced controls, EQ viewport bounds and Escape');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
