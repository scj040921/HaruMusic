import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const profile=resolve('artifacts/desktop-ui-profile');mkdirSync(profile,{recursive:true});
const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:['--user-data-dir='+profile,'out/main/index.js'],timeout:30000});
try {
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.waitForLoadState('domcontentloaded');
 await page.evaluate(()=>{localStorage.setItem('haru-salt-mode','true');localStorage.setItem('haru-liquid-mode','false');localStorage.setItem('music-full-config',JSON.stringify({fontSize:28,saltPlayerTheme:'dark'}));});
 await page.reload();
 const agree=page.getByText('我已阅读并同意',{exact:true});if(await agree.isVisible())await agree.click();
 await page.waitForSelector('.liquid-sidebar');
 assert.equal(await page.getByText('切换 Salt UI',{exact:true}).count(),0);
 assert.deepEqual(await page.evaluate(()=>({old:localStorage.getItem('haru-salt-mode'),liquid:localStorage.getItem('haru-liquid-mode')})),{old:null,liquid:'true'});
 await page.evaluate(()=>{
  const pinia=document.getElementById('app').__vue_app__.config.globalProperties.$pinia;
  const core=pinia._s.get('playerCore');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#185b64"/><circle cx="400" cy="270" r="180" fill="#ddbc8c"/><path d="M0 360L600 90V600H0" fill="#333b4c"/></svg>';
  core.playMusic={id:'desktop-fixture',source:'local',name:'Liquid / 光的形状',ar:[{id:1,name:'HaruMusic'}],picUrl:'data:image/svg+xml,'+encodeURIComponent(svg),primaryColor:'#346a72'};
 });
 await page.waitForSelector('.music-play-bar');await page.waitForTimeout(300);
 await page.locator('.music-content-title').first().click();
 await page.waitForSelector('.liquid-now-playing');await page.waitForTimeout(600);
 assert.equal(await page.locator('[class*="salt-"]').count(),0);
 const config=await page.evaluate(()=>JSON.parse(localStorage.getItem('music-full-config')));
 assert.equal(config.fontSize,28);assert.equal(Object.keys(config).some(k=>k.startsWith('salt')),false);
 mkdirSync('artifacts/ui-0.1.12',{recursive:true});await page.screenshot({path:'artifacts/ui-0.1.12/desktop-liquid.png'});
 assert.deepEqual(errors,[]);console.log('Actual Electron renderer: Salt migration persisted, obsolete settings removed, Liquid player and cover rendered.');
} finally {await app.close();}
