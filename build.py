import json, pathlib
R = pathlib.Path(__file__).parent; S = R/'src'; D = R  # o site é publicado a partir da raiz do repositório
js = '\n'.join((S/f).read_text() for f in ['core.js','books.js','bible.js','ink.js','theme.js','estimate.js','app.js','reader.js','porter.js','onenote.js','cloud.js','team.js','ai.js','report.js','strong.js','share.js','media.js','emoji.js','book.js','kinds.js','find.js','translate.js','tour.js','onepkg.js','main.js'])
import datetime as _dt, hashlib as _hl
_stamp = _dt.datetime.now(_dt.timezone(_dt.timedelta(hours=-5))).strftime('%d/%m %H:%M')
_code = _hl.sha1(((S/'styles.css').read_text() + js).encode()).hexdigest()[:6]
import re as _re
_cl = (S.parent/'CHANGELOG.md').read_text()
_notes = [{'v': m.group(1), 'd': m.group(2), 'items': [_re.sub(r'\*\*(.+?)\*\*', r'\1', l[2:].strip()) for l in m.group(3).strip().splitlines() if l.startswith('- ')]} for m in _re.finditer(r'^## (\S+) — (\S+)\n(.*?)(?=^## |\Z)', _cl, _re.M | _re.S)][:12]
_ver = _notes[0]['v'] if _notes else '0'
js = "window.SS_BUILD = " + json.dumps({'version': _ver, 'code': _code, 'at': _stamp, 'notes': _notes}, ensure_ascii=False) + ";\n" + js
html = (S/'index.html').read_text().replace('/*CSS*/', (S/'styles.css').read_text()).replace('/*JS*/', js)
(D/'index.html').write_text(html)
(D/'manifest.webmanifest').write_text(json.dumps({
 "name":"SmartSower","short_name":"SmartSower","description":"Prepare e pregue suas ministrações e escreva seus livros","start_url":"./","scope":"./","display":"standalone",
 "background_color":"#7719aa","theme_color":"#7719aa","lang":"pt-BR",
 "icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]}, ensure_ascii=False, indent=1))
import hashlib
ver = hashlib.sha1(html.encode('utf-8')).hexdigest()[:10]
(D/'sw.js').write_text("""const C='smartsower-""" + ver + """';
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
""")
(D/'supabase.sql').write_text((S/'supabase.sql').read_text())
if not (D/'config.js').exists():
    (D/'config.js').write_text("// Configuração da nuvem (Supabase). A chave 'anon public' é feita para ficar no navegador:\n// a proteção dos dados vem das regras de segurança (RLS) criadas pelo supabase.sql.\nwindow.SMARTSOWER_CONFIG = {\n  supabaseUrl: '',      // ex.: 'https://abcdefgh.supabase.co'\n  supabaseAnonKey: ''   // Project Settings > API > anon public\n};\n")
(D/'.nojekyll').write_text('')
(D/'ler.html').write_text((S/'ler.html').read_text())
print('ok', len(html)//1024, 'KB')
