'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ownerPath=process.env.LOC_OWNER_FILE || 'gestion.html';
const html=fs.readFileSync(ownerPath,'utf8');

function sourceFunction(name){
  const start=html.indexOf('async function '+name+'(');
  assert.ok(start>=0,'Cannot find '+name);
  const end=html.indexOf('\n}\n',start);
  assert.ok(end>start,'Cannot find end of '+name);
  return html.slice(start,end+2);
}
function fixture(){
  const calls=[];
  const status={textContent:''};
  const ctx={
    console,Date,URL,window:{confirm:()=>true},
    unitId:'00000000-0000-4000-8000-000000000a02',
    SITE_SLUG:'test-tenant',reservations:[],ownerCancelV30Enabled:false,
    $:()=>status,saveStatus:status,
    db:{rpc:async(name,args)=>{calls.push({name,args});return {data:[],error:null};}},
    renderReservations:()=>{},render:()=>{},loadData:async()=>{},
    setMsg:()=>{},msg:()=>{},
    BroadcastChannel:class {postMessage(){}close(){}},
    localStorage:{setItem(){}},
  };
  vm.createContext(ctx);
  return {ctx,calls,status};
}
test('every inline owner script compiles (no browser/API calls)',()=>{
  let count=0;
  const re=/<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for(const match of html.matchAll(re)){
    if(!match[1].trim())continue;
    assert.doesNotThrow(()=>new vm.Script(match[1],{filename:ownerPath}));
    count++;
  }
  assert.ok(count>=1);
});
test('cancel button requires active status AND V30 metadata; old carnet unchanged',()=>{
  assert.match(html,/ownerCancelV30Enabled\s*&&\s*r\.status==='active'/);
  assert.match(html,/r\.status!=='cancelled'\s*&&\s*key>=r\.start_day/);
  assert.match(html,/Annulée/);
  assert.match(html,/window\.confirm/);
});
test('legacy fallback never activates cancellation',async()=>{
  const {ctx,calls}=fixture();
  ctx.db.rpc=async(name,args)=>{
    calls.push({name,args});
    if(name==='digiy_loc_master_list_reservations_v2')
      return {data:null,error:{code:'PGRST202',message:'Could not find the function in schema cache'}};
    return {data:[{id:'old-1',guest_name:'Legacy synthetic'}],error:null};
  };
  vm.runInContext(sourceFunction('loadReservationCarnet'),ctx);
  const ok=await vm.runInContext('loadReservationCarnet()',ctx);
  assert.equal(ok,true);
  assert.equal(ctx.ownerCancelV30Enabled,false);
  assert.equal(ctx.reservations.length,1);
  assert.deepEqual(calls.map(x=>x.name),[
    'digiy_loc_master_list_reservations_v2','digiy_loc_master_list_reservations_v1'
  ]);
});
test('V30 active carnet enables cancellation only after successful status response',async()=>{
  const {ctx,calls}=fixture();
  ctx.db.rpc=async(name,args)=>{calls.push({name,args});return {
    data:[{id:'v30-1',guest_name:'Synthetic',status:'active'}],error:null
  };};
  vm.runInContext(sourceFunction('loadReservationCarnet'),ctx);
  await vm.runInContext('loadReservationCarnet()',ctx);
  assert.equal(ctx.ownerCancelV30Enabled,true);
  assert.equal(ctx.reservations[0].status,'active');
  assert.equal(calls.length,1);
});
test('non-schema RPC failure cannot silently fall back to old API',async()=>{
  const {ctx,calls}=fixture();
  ctx.db.rpc=async(name,args)=>{calls.push({name,args});return {
    data:null,error:{code:'42501',message:'permission denied'}
  };};
  vm.runInContext(sourceFunction('loadReservationCarnet'),ctx);
  await vm.runInContext('loadReservationCarnet()',ctx);
  assert.equal(ctx.ownerCancelV30Enabled,false);
  assert.equal(ctx.reservations.length,0);
  assert.equal(calls.length,1);
});
test('explicit confirmed cancellation calls only owner-scoped RPC; never contacts client',async()=>{
  const {ctx,calls}=fixture();
  let confirmed=0, reloads=0;
  ctx.ownerCancelV30Enabled=true;
  ctx.window.confirm=()=>{confirmed++;return true;};
  ctx.loadData=async()=>{reloads++;};
  ctx.db.rpc=async(name,args)=>{calls.push({name,args});return {
    data:{ok:true,status:'cancelled',released_days:3,retained_blocked_days:0},error:null
  };};
  vm.runInContext(sourceFunction('cancelPrivateReservation'),ctx);
  const button={disabled:false};
  await ctx.cancelPrivateReservation({
    id:'00000000-0000-4000-8000-000000000a90',
    guest_name:'Synthetic',start_day:'2026-12-20',end_day:'2026-12-22',
    status:'active'
  },button);
  assert.equal(confirmed,1);
  assert.equal(reloads,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'digiy_loc_master_cancel_reservation_v1');
  assert.equal(calls[0].args.p_reservation_id,'00000000-0000-4000-8000-000000000a90');
  assert.equal(button.disabled,false);
});
