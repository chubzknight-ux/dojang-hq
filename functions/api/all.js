import { adminGuard, adminPinOf } from "./staff.js";
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
// Koleksi akun & pembatas percobaan tidak pernah dikirim ke browser (berisi hash kata sandi).
const HIDDEN=new Set(["staff","staff_rl"]);
export async function onRequestGet({env,request}){
  const bad=await adminGuard(request,env,adminPinOf(env));
  if(bad)return bad;
  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs").all();
  const out={};let pending=0;
  for(const r of rs.results){
    if(HIDDEN.has(r.coll)){if(r.coll==="staff"){try{if(JSON.parse(r.data).pending)pending++}catch(e){}}continue;}
    (out[r.coll]=out[r.coll]||[]).push({id:r.id,...JSON.parse(r.data)});
  }
  out._pendingStaff=pending;
  return J(out);
}
