const C='smartsower-3297e5bade';
const FILES=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(FILES)));self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
/* página e configuração: busca na rede primeiro (versão nova na hora); sem internet, usa a cópia guardada */
const fresh=(req,c)=>new Promise(res=>{let done=false;const fb=()=>c.match(req,{ignoreSearch:true}).then(h=>h||c.match('./index.html'));
 const t=setTimeout(()=>{if(!done)fb().then(h=>{if(h&&!done){done=true;res(h);}});},4000);
 fetch(req,{cache:'no-store'}).then(r=>{if(r.ok)c.put(req,r.clone());if(!done){done=true;clearTimeout(t);res(r);}}).catch(()=>fb().then(h=>{if(!done){done=true;clearTimeout(t);res(h||Response.error());}}));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
 const page=e.request.mode==='navigate'||['/','index.html','config.js'].some(x=>u.pathname.endsWith(x));
 e.respondWith(caches.open(C).then(async c=>{if(page)return fresh(e.request,c);const hit=await c.match(e.request);const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r;}).catch(()=>hit);return hit||net;}));});
