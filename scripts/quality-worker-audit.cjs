const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/24656/AppData/Local/Temp/haru-ui-tests/node_modules/playwright-core');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.addInitScript(()=>localStorage.setItem('disclaimer_agreed_timestamp',String(Date.now())));await page.goto('http://127.0.0.1:5191/');await page.locator('.mode-switch').waitFor();
 const results=await page.evaluate(async()=>{const {getPluginSandboxRunner,disposeAllPluginSandboxes}=await import('/services/musicSource/PluginSandboxRunner.ts');
 const song={id:123,name:'Test',source:'netease',ar:[],al:{}};
 const run=async(id,dialect,source)=>{const r=await getPluginSandboxRunner({id,name:id,dialect,source,vars:[],userVars:{},enabled:true,order:0,createdAt:0,updatedAt:0});return (await r.getMediaSource(song,'auto'))?.url};
 const lx=(supported,fail)=>`globalThis.lx.on('request',async ({info})=>{if(${JSON.stringify(fail)}.includes(info.type))throw Error('unavailable');return 'https://example.com/'+info.type+'.flac';});globalThis.lx.send('inited',${JSON.stringify({sources:{wy:{name:'Test',actions:['musicUrl'],qualitys:supported}}})});`;

 const high=await run('lx-high','lxmusic',lx(['flac24bit','flac','320k'],[]));
 const fallback=await run('lx-fallback','lxmusic',lx(['flac24bit','flac','320k'],['flac24bit']));
 const supported=await run('lx-supported','lxmusic',lx(['320k','128k'],[]));
 const native=await run('native-fallback','native',`module.exports={platform:'test',getMediaSource:async(item,quality)=>{if(['jymaster','hires'].includes(quality))throw Error('unavailable');return {url:'https://example.com/'+quality+'.flac'}}}`);
 disposeAllPluginSandboxes();return{high,fallback,supported,native};});
 assert.equal(results.high,'https://example.com/flac24bit.flac');assert.equal(results.fallback,'https://example.com/flac.flac');assert.equal(results.supported,'https://example.com/320k.flac');assert.equal(results.native,'https://example.com/lossless.flac');console.log('PASS: real worker highest-supported and fallback qualities',results);await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
