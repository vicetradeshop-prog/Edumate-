#!/usr/bin/env node
/**
 * Test de bout en bout du fil d'actualités et des sondages (API réelle).
 *
 * Démarre le build de production (`dist/server/index.js`) sur un port dédié,
 * puis vérifie : permissions (401/403), validation des entrées (400), vote et
 * changement de vote sans double comptage, clôture, état de lecture,
 * suppression en cascade.
 *
 * Prérequis : `npm run build:server` (inclus dans `npm run build`).
 * Lancement : FEED_PORT=8998 node scripts/test-feed.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const PORT = Number(process.env.FEED_PORT ?? 8998);
const BASE = `http://127.0.0.1:${PORT}`;
const log = fs.openSync(path.join(root, 'feed-server.log'), 'w');
const server = spawn(process.execPath, ['dist/server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', FALLBACK_STORAGE: 'memory', SESSION_SECRET: 'feed-test-secret-0123456789', AI_PROVIDER: 'none' },
  stdio: ['ignore', log, log],
});
class C { constructor(){this.ck=[];this.csrf=''}
  async rq(m,u,b){const h={Accept:'application/json',Cookie:this.ck.join('; ')};if(b!==undefined)h['Content-Type']='application/json';if(m!=='GET'&&this.csrf)h['X-CSRF-Token']=this.csrf;
    const r=await fetch(BASE+u,{method:m,headers:h,body:b===undefined?undefined:JSON.stringify(b)});
    for(const c of (r.headers.getSetCookie?.()??[])){const p=c.split(';')[0];const n=p.split('=')[0];this.ck=this.ck.filter(x=>!x.startsWith(n+'='));this.ck.push(p);if(n==='edumate_csrf')this.csrf=decodeURIComponent(p.split('=').slice(1).join('='));}
    const t=await r.text();let j=null;try{j=JSON.parse(t)}catch{j=t}return{s:r.status,j}}
  get(u){return this.rq('GET',u)} post(u,b){return this.rq('POST',u,b??{})} patch(u,b){return this.rq('PATCH',u,b??{})} del(u){return this.rq('DELETE',u)} }
let ok=0,bad=0;const fails=[];
const ck=(l,c,d='')=>{c?(ok++,console.log('  ✅ '+l)):(bad++,fails.push(l+(d?' — '+d:'')),console.log('  ❌ '+l+(d?' — '+d:'')))};
const wait=async()=>{for(let i=0;i<60;i++){try{const r=await fetch(BASE+'/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,400))}throw new Error('serveur non démarré')};
try {
  await wait();
  console.log('\n── Protection ──');
  const anon=new C(); ck('anonyme → 401 sur /api/feed',(await anon.get('/api/feed')).s===401);
  console.log('\n── Administration ──');
  const admin=new C();
  const sa=await admin.post('/api/auth/signup',{firstName:'Admin',email:'ad'+Date.now()+'@e.test',password:'motdepasse123'});
  ck('premier compte = admin',sa.j?.user?.role==='admin',sa.j?.user?.role);
  const n1=await admin.post('/api/admin/feed',{title:'Nouvelle version 1.1',body:'Le coach de quiz est arrivé !',importance:'update',link:'/assistant'});
  ck('publier une actualité → 201',n1.s===201,'HTTP '+n1.s);
  ck('actualité créée avec id',Boolean(n1.j?.item?.id));
  ck('importance conservée',n1.j?.item?.importance==='update',n1.j?.item?.importance);
  const p1=await admin.post('/api/admin/polls',{question:'Quelle matière veux-tu en plus ?',options:['Latin','Allemand','HGGSP','Arts'],singleChoice:true});
  ck('créer un sondage → 201',p1.s===201,'HTTP '+p1.s);
  ck('sondage : 4 options',p1.j?.poll?.options?.length===4);
  ck('une annonce de fil est créée avec le sondage',p1.j?.item?.kind==='poll'&&Boolean(p1.j?.item?.pollId));
  ck('sondage à 1 option → 400',(await admin.post('/api/admin/polls',{question:'Test',options:['Seul']})).s===400);
  ck('options dupliquées → 400',(await admin.post('/api/admin/polls',{question:'Doublons',options:['A','a']})).s===400);
  ck('question trop courte → 400',(await admin.post('/api/admin/polls',{question:'x',options:['A','B']})).s===400);
  ck('lien externe refusé → 400',(await admin.post('/api/admin/feed',{title:'Lien sortant',body:'x',link:'https://evil.example'})).s===400);
  ck('titre trop court → 400',(await admin.post('/api/admin/feed',{title:'ab',body:'x'})).s===400);
  ck('corps vide → 400',(await admin.post('/api/admin/feed',{title:'Titre valide',body:'   '})).s===400);
  console.log('\n── Élève ──');
  const el=new C();
  await el.post('/api/auth/signup',{firstName:'Léa',email:'el'+Date.now()+'@e.test',password:'motdepasse123'});
  const f1=await el.get('/api/feed');
  ck('fil → 200',f1.s===200,'HTTP '+f1.s);
  ck('2 éléments dans le fil',f1.j?.items?.length===2,String(f1.j?.items?.length));
  ck('unreadCount = 2',f1.j?.unreadCount===2,String(f1.j?.unreadCount));
  ck('sondage inclus dans la réponse',Object.keys(f1.j?.polls||{}).length===1);
  ck('aucun vote au départ',Object.values(f1.j?.myVotes||{}).every(v=>Array.isArray(v)&&v.length===0));
  ck('/api/feed/unread renvoie le même compte',(await el.get('/api/feed/unread')).j?.unreadCount===2);
  ck('un élève ne peut PAS publier → 403',(await el.post('/api/admin/feed',{title:'Hack',body:'x'})).s===403);
  console.log('\n── Vote ──');
  const pollId=Object.keys(f1.j.polls)[0];
  const opts=f1.j.polls[pollId].options;
  const v1=await el.post('/api/feed/polls/'+pollId+'/vote',{optionIds:[opts[2].id]});
  ck('vote → 200',v1.s===200,'HTTP '+v1.s);
  ck('compteur incrémenté',v1.j?.poll?.options?.[2]?.count===1,String(v1.j?.poll?.options?.[2]?.count));
  ck('voters = 1',v1.j?.poll?.voters===1,String(v1.j?.poll?.voters));
  ck('mon vote enregistré',JSON.stringify(v1.j?.myVotes)===JSON.stringify([opts[2].id]),JSON.stringify(v1.j?.myVotes));
  const v2=await el.post('/api/feed/polls/'+pollId+'/vote',{optionIds:[opts[0].id]});
  ck('changement de vote accepté',v2.s===200);
  ck('ancien choix décrémenté',v2.j?.poll?.options?.[2]?.count===0,String(v2.j?.poll?.options?.[2]?.count));
  ck('nouveau choix incrémenté',v2.j?.poll?.options?.[0]?.count===1,String(v2.j?.poll?.options?.[0]?.count));
  ck('voters reste à 1 (pas de double comptage)',v2.j?.poll?.voters===1,String(v2.j?.poll?.voters));
  ck('option inconnue → 400',(await el.post('/api/feed/polls/'+pollId+'/vote',{optionIds:['inexistant']})).s===400);
  ck('liste vide → 400',(await el.post('/api/feed/polls/'+pollId+'/vote',{optionIds:[]})).s===400);
  ck('sondage inexistant → 400',(await el.post('/api/feed/polls/pas-un-sondage/vote',{optionIds:['x']})).s===400);
  const el2=new C(); await el2.post('/api/auth/signup',{firstName:'Noa',email:'e2'+Date.now()+'@e.test',password:'motdepasse123'});
  const v3=await el2.post('/api/feed/polls/'+pollId+'/vote',{optionIds:[opts[0].id]});
  ck('second votant : voters = 2',v3.j?.poll?.voters===2,String(v3.j?.poll?.voters));
  ck('second votant : compteur = 2',v3.j?.poll?.options?.[0]?.count===2,String(v3.j?.poll?.options?.[0]?.count));
  console.log('\n── Clôture ──');
  ck('clôture → 200',(await admin.patch('/api/admin/polls/'+pollId,{closed:true})).s===200);
  ck('vote refusé après clôture → 400',(await el.post('/api/feed/polls/'+pollId+'/vote',{optionIds:[opts[1].id]})).s===400);
  ck('clôture d’un sondage inexistant → 404',(await admin.patch('/api/admin/polls/xyz',{closed:true})).s===404);
  console.log('\n── Lecture ──');
  const itemId=f1.j.items[0].id;
  const r1=await el.post('/api/feed/'+itemId+'/read',{});
  ck('marquer lu → 200',r1.s===200);
  ck('unreadCount descend à 1',r1.j?.unreadCount===1,String(r1.j?.unreadCount));
  ck('marquer lu est idempotent',(await el.post('/api/feed/'+itemId+'/read',{})).j?.unreadCount===1);
  ck('tout marquer lu → 0',(await el.post('/api/feed/read-all',{})).j?.unreadCount===0);
  ck('le fil confirme 0 non lus',(await el.get('/api/feed')).j?.unreadCount===0);
  ck('élément inexistant → 404',(await el.post('/api/feed/pas-un-element/read',{})).s===404);
  console.log('\n── Suppression ──');
  const other=f1.j.items[1].id;
  ck('supprimer → 200',(await admin.del('/api/admin/feed/'+other)).s===200);
  ck('il reste 1 élément',(await el.get('/api/feed')).j?.items?.length===1);
  ck('double suppression → 404',(await admin.del('/api/admin/feed/'+other)).s===404);
  ck('admin /feed liste les éléments',(await admin.get('/api/admin/feed')).j?.items?.length===1);
  console.log(`\n${'='.repeat(62)}`);
  if(bad){console.log(`  ❌ ${ok} réussi(s), ${bad} échec(s) :`);for(const f of fails)console.log('     • '+f);}
  else console.log(`  Résultat : ${ok} contrôles réussis, 0 échec(s)`);
  console.log('='.repeat(62));
  server.kill('SIGTERM'); process.exit(bad?1:0);
} catch(e){ console.error('Erreur fatale :',e.message); console.error(fs.readFileSync(path.join(root,'feed-server.log'),'utf8').slice(0,1500)); server.kill('SIGTERM'); process.exit(1); }
