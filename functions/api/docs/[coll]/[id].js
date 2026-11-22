const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
import { adminGuard, adminPinOf, audit } from "../../staff.js";
// akun pelatih hanya boleh diubah lewat /api/staff (yang memeriksa & meng-hash kata sandi); hasil Champion lewat /api/champion
const valid=p=>/^[a-z]{1,30}$/.test(p.coll)&&p.coll!=="staff"&&p.coll!=="champion"&&/^[A-Za-z0-9_-]{1,80}$/.test(p.id);
const MAX_BODY=2_000_000;
const readBody=async request=>{if(Number(request.headers.get("content-length")||0)>MAX_BODY)return null;const b=await request.json().catch(()=>null);return b&&typeof b==="object"&&!Array.isArray(b)?b:null};
// Nama yang mudah dibaca untuk Riwayat Aktivitas (murid: n, pelatih/unit: name)
const labelOf=d=>{if(!d||typeof d!=="object")return "";const v=d.n||d.name||"";return typeof v==="string"?v.slice(0,80):"";};
// Setiap simpan/hapus dari admin dicatat, supaya perubahan data bisa ditelusuri
// Simpan berulang atas data yang sama dalam 10 menit digabung jadi satu baris.
const log=(env,action,coll,id,d)=>{const nm=labelOf(d);return audit(env,"Admin","owner",action,nm?{coll,id,nm}:{coll,id},action==="data_simpan"?10:0);};

export async function onRequestPut({params,env,request}){
  {const bad=await adminGuard(request,env,adminPinOf(env));if(bad)return bad;}
  if(!valid(params))return J({error:"bad id"},400);
  const b=await readBody(request);if(!b)return J({error:"bad body"},400);
  await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES(?,?,?)").bind(params.coll,params.id,JSON.stringify(b)).run();
  await log(env,"data_simpan",params.coll,params.id,b);
  return J({ok:true});
}
// PATCH biasa: gabungkan kolom teratas.
// PATCH ?merge=ids (absensi & iuran): hanya centang yang dikirim yang diubah, centang lain (mis. dari pelatih) tetap.
export async function onRequestPatch({params,env,request}){
  {const bad=await adminGuard(request,env,adminPinOf(env));if(bad)return bad;}
  if(!valid(params))return J({error:"bad id"},400);
  const b=await readBody(request);if(!b)return J({error:"bad body"},400);
  const mergeIds=new URL(request.url).searchParams.get("merge")==="ids";
  if(mergeIds&&(!b.ids||typeof b.ids!=="object"||Array.isArray(b.ids)))return J({error:"bad ids"},400);
  const cur=await env.DB.prepare("SELECT data FROM docs WHERE coll=? AND id=?").bind(params.coll,params.id).first();
  let old={};try{old=cur?JSON.parse(cur.data):{};}catch(e){}
  const merged=mergeIds?{...old,...b,ids:{...((old.ids&&typeof old.ids==="object")?old.ids:{}),...b.ids}}:{...old,...b};
  await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES(?,?,?)").bind(params.coll,params.id,JSON.stringify(merged)).run();
  if(mergeIds)await audit(env,"Admin","owner","data_simpan",{coll:params.coll,id:params.id,set:b.ids});
  else await log(env,"data_simpan",params.coll,params.id,merged);
  return J({ok:true});
}
export async function onRequestDelete({params,env,request}){
  {const bad=await adminGuard(request,env,adminPinOf(env));if(bad)return bad;}
  if(!valid(params))return J({error:"bad id"},400);
  const cur=await env.DB.prepare("SELECT data FROM docs WHERE coll=? AND id=?").bind(params.coll,params.id).first();
  await env.DB.prepare("DELETE FROM docs WHERE coll=? AND id=?").bind(params.coll,params.id).run();
  let old=null;try{old=cur?JSON.parse(cur.data):null;}catch(e){}
  if(cur)await log(env,"data_hapus",params.coll,params.id,old);
  return J({ok:true});
}
