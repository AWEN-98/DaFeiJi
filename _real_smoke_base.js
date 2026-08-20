const fs=require('fs'),path=require('path'),http=require('http');
const puppeteer=require('puppeteer-core');
const ROOT=path.resolve(__dirname,'playtest');const PORT=8126;
const CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe';
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.json':'application/json'};
const server=http.createServer((req,res)=>{let p=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));if(p.endsWith('/')||!path.extname(p))p=path.join(p,'index.html');fs.readFile(p,(e,d)=>{if(e){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':mime[path.extname(p).toLowerCase()]||'application/octet-stream'});res.end(d);});});
async function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
(async()=>{
  await new Promise(r=>server.listen(PORT,r));
  const browser=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
  page.on('console',m=>{const t=m.text();if(m.type()==='error'&&!/404|favicon|Failed to load resource/i.test(t))errors.push('CONSOLE: '+t);});
  page.on('requestfailed',r=>{if(!r.url().includes('favicon'))errors.push('REQFAIL: '+r.url());});
  await page.evaluateOnNewDocument(()=>{window.__stub={};window.global=window;});
  await page.setViewport({width:812,height:375,deviceScaleFactor:1}); // iPhone landscape
  await page.goto('http://localhost:'+PORT+'/index.html',{waitUntil:'networkidle0',timeout:60000});
  await sleep(1200);
  // dismiss tutorial if present
  await page.evaluate(()=>{const b=document.getElementById('tutorialClose');if(b)b.click();});
  await sleep(1500);
  const broken=await page.evaluate(()=>{let c=0,srcs=[];document.querySelectorAll('img').forEach(i=>{if(!i.src||i.src===''||i.src.endsWith('/')||i.src.endsWith('/index.html'))return;if(!i.complete||i.naturalWidth===0){c++;srcs.push(i.src.substring(i.src.lastIndexOf('/')+1));}});return {c,srcs};});
  await page.screenshot({path:path.join(__dirname,'.tmp_browser','real_smoke_base_landscape.png'),fullPage:false});
  await browser.close();server.close();
  if(broken.c)errors.push('brokenImgs='+broken.c+' '+JSON.stringify(broken.srcs));
  if(errors.length){console.error('SMOKE FAILED:');errors.forEach(e=>console.error(e));process.exit(1);}
  console.log('SMOKE OK (base landscape 812x375)');
})().catch(e=>{console.error(e);process.exit(1);});
