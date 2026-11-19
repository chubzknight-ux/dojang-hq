import { userFromToken, cleanEvalDoc, jsonEtag, unitScope, scopeOf, audit, hitLimit, ageOf } from "./staff.js";
import { tokenIds } from "./portal.js";

const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const validId=id=>/^[A-Za-z0-9_-]{1,120}$/.test(id);
const clip=(s,n)=>String(s==null?"":s).slice(0,n);
const isCoachEval=(id,d)=>(d&&d.type==="coach_eval")||String(id).startsWith("coach_eval__");
// Ulasan untuk publik: hanya nilai & komentar. Tanpa ID dokumen (ID lama memuat ID murid = kunci portal orang tua),
// tanpa nama orang tua dan tanpa nama murid.
const publicReview=d=>({type:"coach_eval",targetCoachId:clip(d.targetCoachId,80),targetCoachName:clip(d.targetCoachName,120),date:clip(d.date,10),updatedAt:clip(d.updatedAt,20),ratings:d.ratings&&typeof d.ratings==="object"?d.ratings:{},comment:clip(d.comment,1500)});
const hex=u8=>Array.from(u8,b=>b.toString(16).padStart(2,"0")).join("");
async function reviewId(coachId,date,key){
  const h=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("dojang-review|"+key)));
  return "coach_eval__"+coachId+"__"+date+"__"+hex(h.slice(0,10));
}

// GET
// - Tanpa login (halaman orang tua, layar login): hanya logo, profil pelatih, jadwal, dan ulasan orang tua.
//   Daftar murid dan nilai murid TIDAK dikirim.
// - Dengan token pelatih yang sah: data lengkap untuk Portal Pelatih.
// - Nomor WA pelatih hanya dikirim kepada orang tua yang sudah membuka portal dengan nama anak
//   (header X-Portal-Token yang sah). Selain itu disembunyikan dan diberi tanda waHidden.
export async function onRequestGet({env,request}){
  let user=null;
  if(request.headers.get("X-Dojang-Token")){
    user=await userFromToken(request,env);
    if(!user)return J({error:"unauthorized"},401);
  }
  const ptok=request.headers.get("X-Portal-Token");
  const parentOk=!user&&!!ptok&&!!(await tokenIds(env,ptok));
  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs WHERE coll IN ('students','evaluations','classes','coaches','units','settings') ORDER BY coll,id").all();
  const students=[],evaluations=[],classes=[],coaches=[],units=[];
  let logo=null;
  const rows=[];
  for(const r of rs.results){try{rows.push({coll:r.coll,id:r.id,d:JSON.parse(r.data)});}catch(e){}}
  const scope=user?unitScope(user,rows.filter(r=>r.coll==="students").map(r=>({id:r.id,data:r.d}))):null;
  const uk=x=>String(x==null?"":x).trim().toLowerCase();
  for(const {coll,id,d} of rows){
    const r={coll,id};
    if(r.coll==="students"){if(user&&!d.cuti&&(!scope||scope.ids.has(r.id)))students.push({id:r.id,n:d.n,a:ageOf(d.lahir,d.a),bi:d.bi,v:d.v,unit:d.unit||"Terazza"});}
    else if(r.coll==="evaluations"){
      if(user){
        if(isCoachEval(r.id,d))continue;
        if(scope){const ev={};for(const k of Object.keys(d.ev||{}))if(scope.ids.has(k))ev[k]=d.ev[k];if(!Object.keys(ev).length)continue;d.ev=ev;}
        evaluations.push({id:r.id,...d});
      }else if(isCoachEval(r.id,d))evaluations.push(publicReview(d));
    }
    else if(r.coll==="classes"){if(!scope||scope.units.has(uk(d.unit||"Terazza")))classes.push({id:r.id,unit:d.unit||"Terazza",...d});}
    else if(r.coll==="coaches"){if(!parentOk)delete d.wa;coaches.push({id:r.id,...d});}
    else if(r.coll==="units"){if(!scope||scope.units.has(uk(d.name||r.id)))units.push({id:r.id,...d});}
    else if(r.coll==="settings"&&r.id==="logo")logo=typeof d.data==="string"?d.data:"";
  }
  const noLogo=new URL(request.url).searchParams.get("nologo")==="1";   // polling: logo tidak perlu diunduh ulang
  const out={students,evaluations,classes,coaches,units,waHidden:!parentOk};
  if(!noLogo)out.logo=logo;
  if(user){
    out.user={name:user.name,username:user.username,perm:{absen:!!(user.perm&&user.perm.absen),nilai:!!(user.perm&&user.perm.nilai)},units:Array.isArray(user.units)?user.units:[],mustChange:!!user.mustChange};
    return jsonEtag(request,out);
  }
  return J(out);
}

export async function onRequestPost({env,request}){
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object")return J({error:"bad body"},400);

  if(body.action==="save_eval"){
    const id=String(body.id||"").trim();
    const d=body.data;
    if(!d||typeof d!=="object"||Array.isArray(d)||(d.type!=="coach_eval"&&!validId(id)))return J({error:"invalid eval"},400);
    if(JSON.stringify(d).length>200000)return J({error:"too large"},413);
    let clean;
    if(d.type==="coach_eval"){
      // Ulasan orang tua untuk pelatih (tanpa login).
      // - ID dokumen dibuat server dari "kunci" milik pengirim (ID portal murid atau token acak perangkat),
      //   jadi hanya pengirim yang sama yang bisa memperbarui ulasannya sendiri pada hari yang sama;
      //   ulasan orang lain tidak bisa ditimpa.
      // - Dibatasi 10 ulasan per jaringan per jam.
      const key=String(body.key||"").trim();
      if(!/^[A-Za-z0-9_-]{7,120}$/.test(key))return J({error:"Muat ulang halaman lalu kirim lagi."},400);
      const cid=clip(d.targetCoachId,80);
      if(!validId(cid))return J({error:"invalid coach"},400);
      if(!(await hitLimit(env,request,"rv",10,60*60000)))return J({error:"Terlalu banyak ulasan dari jaringan ini. Coba lagi nanti."},429);
      const r=d.ratings&&typeof d.ratings==="object"?d.ratings:{};
      const rt={};
      for(const k of ["m","t","k","d","w"]){const v=Number(r[k]);rt[k]=v>=1&&v<=5?Math.round(v):5;}
      const today=new Date(Date.now()+7*3600e3).toISOString().slice(0,10);   // tanggal WIB
      const rid=await reviewId(cid,today,key);
      clean={type:"coach_eval",coach:"",targetCoachId:cid,targetCoachName:clip(d.targetCoachName,120),parentName:clip(d.parentName,120),studentName:clip(d.studentName,120),date:today,updatedAt:clip(d.updatedAt,20),ratings:rt,comment:clip(d.comment,1500)};
      await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES('evaluations',?,?)").bind(rid,JSON.stringify(clean)).run();
      return J({ok:true,id:rid});
    }else{
      // penilaian murid: wajib login pelatih yang punya izin, hanya atas nama sendiri
      const user=await userFromToken(request,env);
      if(!user)return J({error:"Silakan masuk dengan akun pelatih."},401);
      const r=cleanEvalDoc(user,id,d,await scopeOf(env,user));
      if(r.error)return J({error:r.error},r.status||400);
      clean=r.clean;
      await audit(env,user.name,"pelatih","penilaian",{id,n:Object.keys(clean.ev).length});
    }
    await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES('evaluations',?,?)")
      .bind(id,JSON.stringify(clean)).run();
    return J({ok:true});
  }

  return J({error:"unknown action"},400);
}