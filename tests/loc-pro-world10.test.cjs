const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../loc-pro-world10.js'),'utf8');

function setup(data){
  const nodes=data.map(e=>{
    const parent={
      content:e.text,
      closest(selector){
        if(e.kind==='client'&&selector.includes('#reservationList')&&!selector.includes('reservation-badge'))return {};
        if(e.kind==='business'&&selector.includes('#siteTitle'))return {};
        if(e.kind==='calendar'&&selector.includes('#calendarGrid'))return {};
        if(e.kind==='note'){
          if(selector.includes('#reservationList')&&!selector.includes('reservation-badge'))return {};
          if(selector.includes('.reservation-badge,.empty-reservations'))return {};
          if(selector.includes('.reservation-note'))return {textContent:e.text};
        }
        if(e.kind==='badge'){
          if(selector.includes('#reservationList')&&!selector.includes('reservation-badge'))return {};
          if(selector.includes('.reservation-badge,.empty-reservations'))return {};
        }
        return null;
      }
    };
    return {nodeValue:e.text,parentElement:parent};
  });
  const input={attrs:{placeholder:'Nom et prénom'},closest(){return null},
    getAttribute(k){return this.attrs[k]||null},
    setAttribute(k,v){this.attrs[k]=v}};
  const link={attrs:{href:'./loc.html?site=chez-baptiste&v=20261002-1412'},closest(){return null},
    getAttribute(k){return this.attrs[k]||null},
    setAttribute(k,v){this.attrs[k]=v}};
  let picker=null;
  const header={appendChild(el){picker=el;return el}};
  const document={
    readyState:'complete',body:{},
    documentElement:{lang:'fr',dir:'ltr'},
    title:'Gestion calendrier — DIGIYLYFE',
    querySelector(s){return s==='header.top'?header:null},
    querySelectorAll(s){if(s==='a[href]')return [link];if(s==='[placeholder]')return [input];return []},
    getElementById(id){return id==='locProWorld10'?picker:null},
    createTreeWalker(){
      let i=-1;
      return {currentNode:null,nextNode(){i++;if(i===nodes.length)return false;this.currentNode=nodes[i];return true}};
    },
    createElement(){
      return {attrs:{},children:[],value:'',style:{},
        setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]||null},
        appendChild(x){this.children.push(x);return x},
        addEventListener(){}};
    }
  };
  const cache=new Map(),refresh={count:0};
  const domain='https://pro-espace.digiylyfe.com';
  const sandbox={
    document,URL,URLSearchParams,NodeFilter:{SHOW_TEXT:4},
    history:{replaceState(){}},
    location:{href:domain+'/loc.html?site=chez-baptiste',
      origin:domain,pathname:'/loc.html',search:'?site=chez-baptiste',hash:''},
    localStorage:{setItem(k,v){cache.set(k,v)},getItem(k){return cache.get(k)||null}},
    MutationObserver:class{observe(){}},
    DIGIY_LOC_REFRESH_LOCALE(){refresh.count++}
  };
  sandbox.window=sandbox;
  vm.runInNewContext(source,sandbox,{timeout:4000});
  return {api:sandbox.DIGIY_LOC_WORLD10,nodes,document,header,picker,link,input,cache,refresh};
}
test('10 languages on real private LOC calendar, preserving ownership and guest data',()=>{
  const p=setup([
    {text:'Calendrier propriétaire'},
    {text:'Disponible'},
    {text:'Occupé'},
    {text:'📒 Carnet des réservations'},
    {text:'👤 Chez Baptiste',kind:'business'},
    {text:'👤 Fatou Diop',kind:'client'},
    {text:'📝 Atelier privé de la cliente',kind:'note'},
    {text:'Annulée',kind:'badge'},
    {text:'2 fiches enregistrées'},
    {text:'Connecté : owner@example.com'},
    {text:'✓ Occupé confirmé en base et calendrier rechargé sur 2 dates.'}
  ]);
  assert.equal(p.api.locales.length,10);
  assert.equal(p.picker.children.length,10);
  p.api.setLang('en');
  assert.equal(p.nodes[0].nodeValue,'Owner calendar');
  assert.equal(p.nodes[1].nodeValue,'Available');
  assert.equal(p.nodes[2].nodeValue,'Occupied');
  assert.equal(p.nodes[3].nodeValue,'📒 Booking register');
  assert.equal(p.nodes[4].nodeValue,'👤 Chez Baptiste');
  assert.equal(p.nodes[5].nodeValue,'👤 Fatou Diop');
  assert.equal(p.nodes[6].nodeValue,'📝 Atelier privé de la cliente');
  assert.equal(p.nodes[7].nodeValue,'Cancelled');
  assert.equal(p.nodes[8].nodeValue,'2 guest records saved');
  assert.equal(p.nodes[9].nodeValue,'Signed in: owner@example.com');
  assert.equal(p.nodes[10].nodeValue,'✓ Occupied confirmed in database; calendar reloaded for 2 dates.');
  assert.equal(p.input.attrs.placeholder,'First and last name');
  assert.equal(new URL(p.link.attrs.href).searchParams.get('site'),'chez-baptiste');
  assert.equal(new URL(p.link.attrs.href).searchParams.get('lang'),'en');
  assert.equal(p.api.locale(),'en-GB');
  assert.equal(p.api.weekdays()[0],'Mo');
  p.api.setLang('ar');
  assert.equal(p.document.documentElement.dir,'rtl');
  assert.match(p.nodes[0].nodeValue,/[\u0600-\u06ff]/);
  assert.equal(p.nodes[4].nodeValue,'👤 Chez Baptiste');
  assert.equal(p.nodes[5].nodeValue,'👤 Fatou Diop');
  assert.equal(p.api.locale(),'ar-SA');
  p.api.setLang('wo');
  assert.equal(p.nodes[0].nodeValue,'Kalandiriye boroom');
  p.api.setLang('zh');
  assert.match(p.nodes[0].nodeValue,/[\u4e00-\u9fff]/);
  p.api.setLang('fr');
  assert.equal(p.nodes[0].nodeValue,'Calendrier propriétaire');
  assert.equal(p.nodes[10].nodeValue,'✓ Occupé confirmé en base et calendrier rechargé sur 2 dates.');
  assert.equal(p.refresh.count,5);
});
test('cancellation confirmation is localized but dates and names are never transformed',()=>{
  const p=setup([]);
  const item={guest_name:'Famille Diop',start_day:'2026-11-20',end_day:'2026-11-25'};
  p.api.setLang('zh');
  const prompt=p.api.confirmCancel(item);
  assert.match(prompt,/取消预订/);
  assert.match(prompt,/Famille Diop/);
  assert.match(prompt,/2026-11-20 → 2026-11-25/);
  assert.match(prompt,/不会自动通知客人/);
  p.api.setLang('fr');
  assert.match(p.api.confirmCancel(item),/Aucun message automatique/);
});
test('dynamic selection, prices and status retain original numbers when translated',()=>{
 const p=setup([
   {text:'Sélection : 17 novembre 2026'},
   {text:'Tarif de base actuel : 78 €'},
   {text:'✓ Prix enregistré : 95 €.'},
   {text:'✓ Réservation annulée, historique conservé. ⚠️ 2 date(s) restent bloquées : vérification manuelle nécessaire.'},
   {text:'⚠️ Réservation non enregistrée : accès refusé'}
 ]);
 p.api.setLang('es');
 assert.equal(p.nodes[0].nodeValue,'Selección: 17 novembre 2026');
 assert.equal(p.nodes[1].nodeValue,'Tarifa base actual: 78 €');
 assert.equal(p.nodes[2].nodeValue,'✓ Precio guardado: 95 €.');
 assert.match(p.nodes[3].nodeValue,/2 fechas siguen bloqueadas/);
 assert.match(p.nodes[4].nodeValue,/acceso rechazado|acceso refusé|accès refusé/);
});
