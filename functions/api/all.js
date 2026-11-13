const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const allowed=(env,req)=>{
  const pin=(env.DOJANG_PIN||"251025").trim();
  const h=(req.headers.get("X-Dojang-Pin")||"").trim();
  return !!pin && h===pin;
};
export async function onRequestGet({env,request}){
  if(!allowed(env,request))return J({error:"forbidden"},403);
  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs").all();
  const out={};
  for(const r of rs.results){(out[r.coll]=out[r.coll]||[]).push({id:r.id,...JSON.parse(r.data)})}
  return J(out);
}