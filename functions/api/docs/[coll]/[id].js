const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json"}});
const allowed=(env,req)=>{
  const pin=(env.DOJANG_PIN||"123456").trim();
  const h=(req.headers.get("X-Dojang-Pin")||"").trim();
  return !!pin && h===pin;
};
const valid=p=>/^[a-z]{1,30}$/.test(p.coll)&&/^[A-Za-z0-9_-]{1,80}$/.test(p.id);
const readBody=async request=>{const b=await request.json();return b&&typeof b==="object"&&!Array.isArray(b)?b:null};
export async function onRequestPut({params,env,request}){
  if(!allowed(env,request))return J({error:"forbidden"},403);
  if(!valid(params))return J({error:"bad id"},400);
  const b=await readBody(request);if(!b)return J({error:"bad body"},400);
  await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES(?,?,?)").bind(params.coll,params.id,JSON.stringify(b)).run();
  return J({ok:true});
}
export async function onRequestPatch({params,env,request}){
  if(!allowed(env,request))return J({error:"forbidden"},403);
  if(!valid(params))return J({error:"bad id"},400);
  const b=await readBody(request);if(!b)return J({error:"bad body"},400);
  const cur=await env.DB.prepare("SELECT data FROM docs WHERE coll=? AND id=?").bind(params.coll,params.id).first();
  const merged={...(cur?JSON.parse(cur.data):{}),...b};
  await env.DB.prepare("INSERT OR REPLACE INTO docs(coll,id,data) VALUES(?,?,?)").bind(params.coll,params.id,JSON.stringify(merged)).run();
  return J({ok:true});
}
export async function onRequestDelete({params,env,request}){
  if(!allowed(env,request))return J({error:"forbidden"},403);
  if(!valid(params))return J({error:"bad id"},400);
  await env.DB.prepare("DELETE FROM docs WHERE coll=? AND id=?").bind(params.coll,params.id).run();
  return J({ok:true});
}