import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('../work/browser-acceptance-owned');await mkdir(root,{recursive:true});
const context=await chromium.launchPersistentContext(path.join(root,'permission-profile'),{executablePath:process.env.CHROME_PATH || chromium.executablePath(),headless:true,args:[`--disable-extensions-except=${path.resolve('dist')}`,`--load-extension=${path.resolve('dist')}`]});
try {
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
 const page=await context.newPage();await page.goto(`chrome-extension://${id}/index.html`);await page.getByRole('button',{name:'Connexions',exact:true}).click();
 await page.getByRole('button',{name:'Connecter le compagnon',exact:true}).click();
 await page.waitForTimeout(1500);
 const nativePermission=await page.evaluate(()=>chrome.permissions.contains({permissions:['nativeMessaging']}));
 const report={extensionId:id,nativePermission,body:(await page.locator('body').innerText()).slice(0,3500)};
 await writeFile(path.join(root,'permission-probe.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 await page.screenshot({path:path.join(root,'permission-probe.png'),fullPage:true});
}finally{await context.close();}
