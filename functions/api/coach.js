const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const validId=id=>/^[A-Za-z0-9_-]{1,120}$/.test(id);
const DATE_ID=/^\d{4}-\d{2}-\d{2}(__[A-Za-z0-9_-]{1,80})?$/;
const clip=(s,n)=>String(s==null?"":s).slice(0,n);

export async function onRequestGet({env}){
  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs WHERE coll IN ('students','evaluations','classes','coaches','units','settings')").all();
  const students=[],evaluations=[],classes=[],coaches=[],units=[];
  let logo=null;
  for(const r of rs.results){
    const d=JSON.parse(r.data);
    if(r.coll==="students"&&!d.cuti)students.push({id:r.id,n:d.n,a:d.a,bi:d.bi,v:d.v,unit:d.unit||"Terazza"});
    else if(r.coll==="evaluations")evaluations.push({id:r.id,...d});
    else if(r.coll==="classes")classes.push({id:r.id,unit:d.unit||"Terazza",...d});
    else if(r.coll==="coaches")coaches.push({id:r.id,...d});
    else if(r.coll==="units")units.push({id:r.id,...d});
    else if(r.coll==="settings"&&r.id==="logo")logo=typeof d.data==="string"?d.data:"";
  }
  return J({students,evaluations,classes,coaches,units,logo});
}

export async function onRequestPost({env,request}){
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object")return J({error:"bad body"},400);

  if(body.action==="register_coach"){
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
      if(!id.startsWith("coach_eval__"))return J({error:"invalid eval id"},400);
      const r=d.ratings&&typeof d.ratings==="object"?d.ratings:{};
      const rt={};
      for(const k of ["m","t","k","d","w"]){const v=Number(r[k]);rt[k]=v>=1&&v<=5?Math.round(v):5;}
      clean={type:"coach_eval",coach:"",targetCoachId:clip(d.targetCoachId,80),targetCoachName:clip(d.targetCoachName,120),parentName:clip(d.parentName,120),studentName:clip(d.studentName,120),date:clip(d.date,10),updatedAt:clip(d.updatedAt,20),ratings:rt,comment:clip(d.comment,1500)};
    }else{
      if(!DATE_ID.test(id)||!d.ev||typeof d.ev!=="object"||Array.isArray(d.ev))return J({error:"invalid eval id"},400);
      clean={date:clip(d.date,10),coach:clip(d.coach,120),updatedAt:clip(d.updatedAt,20),ev:d.ev};
    }
    await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES('evaluations',?,?)")
      .bind(id,JSON.stringify(clean)).run();
    return J({ok:true});
  }

  return J({error:"unknown action"},400);
}