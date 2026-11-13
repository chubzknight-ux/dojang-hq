const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const allowed=(env,req)=>{const e=(req.headers.get("Cf-Access-Authenticated-User-Email")||"").toLowerCase();return !!e&&(env.ALLOWED_EMAILS||"").toLowerCase().split(",").map(s=>s.trim()).includes(e)};
export async function onRequestGet({env,request}){
  if(!allowed(env,request))return J({error:"forbidden"},403);
  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs").all();
  const out={};
  for(const r of rs.results){(out[r.coll]=out[r.coll]||[]).push({id:r.id,...JSON.parse(r.data)})}
  return J(out);
}
