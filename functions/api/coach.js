const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const validId=id=>/^[A-Za-z0-9_-]{1,80}$/.test(id);

export async function onRequestGet({env}){
  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs WHERE coll IN ('students','evaluations','classes','coaches')").all();
  const students=[],evaluations=[],classes=[],coaches=[];
  for(const r of rs.results){
    const d=JSON.parse(r.data);
    if(r.coll==="students"&&!d.cuti)students.push({id:r.id,n:d.n,a:d.a,bi:d.bi,v:d.v});
    else if(r.coll==="evaluations")evaluations.push({id:r.id,...d});
    else if(r.coll==="classes")classes.push({id:r.id,...d});
    else if(r.coll==="coaches")coaches.push({id:r.id,...d});
  }
  return J({students,evaluations,classes,coaches});
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
    if(!validId(id)||!body.data||typeof body.data!=="object")return J({error:"invalid eval"},400);
    await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES('evaluations',?,?)")
      .bind(id,JSON.stringify(body.data)).run();
    return J({ok:true});
  }

  return J({error:"unknown action"},400);
}
