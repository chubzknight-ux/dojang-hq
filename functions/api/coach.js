import { userFromToken, isOwner, cleanEvalDoc } from "./staff.js";

const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const validId=id=>/^[A-Za-z0-9_-]{1,120}$/.test(id);
const clip=(s,n)=>String(s==null?"":s).slice(0,n);
const isCoachEval=(id,d)=>(d&&d.type==="coach_eval")||String(id).startsWith("coach_eval__");

// GET
// - Tanpa login (halaman orang tua, layar login): hanya logo, profil pelatih, jadwal, dan ulasan orang tua.
//   Daftar murid dan nilai murid TIDAK dikirim.
// - Dengan token pelatih yang sah: data lengkap untuk Portal Pelatih.
export async function onRequestGet({env,request}){
  let user=null;
  if(request.headers.get("X-Dojang-Token")){
    user=await userFromToken(request,env);
    if(!user)return J({error:"unauthorized"},401);
  }
  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs WHERE coll IN ('students','evaluations','classes','coaches','units','settings')").all();
  const students=[],evaluations=[],classes=[],coaches=[],units=[];
  let logo=null;
  for(const r of rs.results){
    let d;try{d=JSON.parse(r.data);}catch(e){continue;}
    if(r.coll==="students"){if(user&&!d.cuti)students.push({id:r.id,n:d.n,a:d.a,bi:d.bi,v:d.v,unit:d.unit||"Terazza"});}
    else if(r.coll==="evaluations"){if(user||isCoachEval(r.id,d))evaluations.push({id:r.id,...d});}
    else if(r.coll==="classes")classes.push({id:r.id,unit:d.unit||"Terazza",...d});
    else if(r.coll==="coaches")coaches.push({id:r.id,...d});
    else if(r.coll==="units")units.push({id:r.id,...d});
    else if(r.coll==="settings"&&r.id==="logo")logo=typeof d.data==="string"?d.data:"";
  }
  const out={students,evaluations,classes,coaches,units,logo};
  if(user)out.user={name:user.name,username:user.username,perm:{absen:!!(user.perm&&user.perm.absen),nilai:!!(user.perm&&user.perm.nilai)}};
  return J(out);
}

export async function onRequestPost({env,request}){
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object")return J({error:"bad body"},400);

  // Mendaftarkan pelatih: hanya Super Admin atau akun pelatih yang sudah login
  if(body.action==="register_coach"){
    const who=(await isOwner(request,env))||(await userFromToken(request,env));
    if(!who)return J({error:"unauthorized"},401);
    const id=String(body.id||"").trim();
    const name=String(body.name||"").trim();
    if(!validId(id)||!name)return J({error:"invalid coach"},400);
    await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES('coaches',?,?)")
      .bind(id,JSON.stringify({name,updatedAt:new Date().toISOString()})).run();
    return J({ok:true});
  }

  if(body.action==="save_eval"){
    const id=String(body.id||"").trim();
    const d=body.data;
    if(!validId(id)||!d||typeof d!=="object"||Array.isArray(d))return J({error:"invalid eval"},400);
    if(JSON.stringify(d).length>200000)return J({error:"too large"},413);
    let clean;
    if(d.type==="coach_eval"){
      // ulasan orang tua untuk pelatih: tetap terbuka untuk orang tua (tanpa login)
      if(!id.startsWith("coach_eval__"))return J({error:"invalid eval id"},400);
      const r=d.ratings&&typeof d.ratings==="object"?d.ratings:{};
      const rt={};
      for(const k of ["m","t","k","d","w"]){const v=Number(r[k]);rt[k]=v>=1&&v<=5?Math.round(v):5;}
      clean={type:"coach_eval",coach:"",targetCoachId:clip(d.targetCoachId,80),targetCoachName:clip(d.targetCoachName,120),parentName:clip(d.parentName,120),studentName:clip(d.studentName,120),date:clip(d.date,10),updatedAt:clip(d.updatedAt,20),ratings:rt,comment:clip(d.comment,1500)};
    }else{
      // penilaian murid: wajib login pelatih yang punya izin, hanya atas nama sendiri
      const user=await userFromToken(request,env);
      if(!user)return J({error:"Silakan masuk dengan akun pelatih."},401);
      const r=cleanEvalDoc(user,id,d);
      if(r.error)return J({error:r.error},r.status||400);
      clean=r.clean;
    }
    await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES('evaluations',?,?)")
      .bind(id,JSON.stringify(clean)).run();
    return J({ok:true});
  }

  return J({error:"unknown action"},400);
}