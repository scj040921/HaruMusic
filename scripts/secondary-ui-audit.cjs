const {chromium}=require(process.env.PLAYWRIGHT_PATH || 'C:/Users/24656/AppData/Local/Temp/haru-ui-tests/node_modules/playwright-core');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('disclaimer_agreed_timestamp',String(Date.now()));localStorage.setItem('haru-liquid-mode','true')});
 await page.goto('http://127.0.0.1:5191/');await page.getByRole('button',{name:'关闭 Liquid Glass'}).waitFor();
 const results=[];
 for(const route of ['/set','/search','/list','/album','/toplist','/user','/history','/favorite','/playlist/import','/downloads','/heatmap','/history-recommend','/artist/detail/1','/music-list/1','/user/follows','/user/followers','/podcast/radio/1']){
  const start=errors.length;
  await page.evaluate(async(route)=>{const {default:r}=await import('/router/index.ts');await r.push(route)},route);
  await page.waitForTimeout(400);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  results.push({route,errors:errors.slice(start),overflow});
 }
 fs.mkdirSync('artifacts/ui-audit',{recursive:true});fs.writeFileSync('artifacts/ui-audit/routes.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.filter(r=>r.errors.length||r.overflow),null,2));
 await browser.close();if(results.some(r=>r.errors.length||r.overflow))process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
