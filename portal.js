const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
export async function onRequestGet({env,request}){
  const url=new URL(request.url);
  const id=(url.searchParams.get("id")||"").trim();
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))return J({error:"ID tidak valid"},400);

  const stRow=await env.DB.prepare("SELECT data FROM docs WHERE coll='students' AND id=?").bind(id).first();
  if(!stRow)return J({error:"Murid tidak ditemukan"},404);
  const st=JSON.parse(stRow.data);

  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs WHERE coll IN ('attendance','payments','evaluations','classes')").all();
  const att=[],pay=[],ev=[],cls=[];
  for(const r of rs.results){
    const d=JSON.parse(r.data);
    if(r.coll==="attendance")att.push({id:r.id,hadir:!!(d.ids&&d.ids[id])});
    else if(r.coll==="payments")pay.push({id:r.id,lunas:!!(d.ids&&d.ids[id])});
    else if(r.coll==="evaluations"&&d.ev&&d.ev[id])ev.push({id:r.id,...d.ev[id]});
    else if(r.coll==="classes")cls.push({id:r.id,...d});
  }
  return J({
    student:{id,n:st.n,a:st.a,bi:st.bi,v:st.v,sk:st.sk,note:st.note,sejak:st.sejak,siap:st.siap,pct:st.pct},
    attendance:att,
    payments:pay,
    evaluations:ev,
    classes:cls
  });
}
