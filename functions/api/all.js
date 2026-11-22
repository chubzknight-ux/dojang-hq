import { adminGuard, adminPinOf, jsonEtag } from "./staff.js";
const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
// Koleksi akun & pembatas percobaan tidak pernah dikirim ke browser (berisi hash kata sandi).
// Keduanya juga tidak dibaca di sini: rentang coll<'staff' / coll>'staff_rl' memakai indeks, jadi hemat kuota baca D1.
// (Nama koleksi lain hanya huruf a-z, jadi tidak ada yang jatuh di antara 'staff' dan 'staff_rl'.)
// Koleksi Champion (hasil, foto, PR) juga tidak ikut: berat dan punya jalur sendiri di /api/champion.
// Rentang 'champion'..'champion_pr' dilewati lewat indeks, jadi data Champion tidak ikut terbaca dari D1.
const HIDDEN=new Set(["staff","staff_rl","champion","champion_foto","champion_pr"]);
export async function onRequestGet({env,request}){
  const bad=await adminGuard(request,env,adminPinOf(env));
  if(bad)return bad;
  const [rs,st]=await Promise.all([
    env.DB.prepare("SELECT coll,id,data FROM docs WHERE coll<'champion' OR (coll>'champion_pr' AND coll<'staff') OR coll>'staff_rl'").all(),
    env.DB.prepare("SELECT data FROM docs WHERE coll='staff'").all()
  ]);
  const out={};let pending=0;
  for(const r of st.results){try{if(JSON.parse(r.data).pending)pending++}catch(e){}}
  for(const r of rs.results){
    if(HIDDEN.has(r.coll))continue;
    (out[r.coll]=out[r.coll]||[]).push({id:r.id,...JSON.parse(r.data)});
  }
  out._pendingStaff=pending;
  return jsonEtag(request,out);   // 304 bila tidak ada perubahan: browser tidak mengunduh ulang
}
