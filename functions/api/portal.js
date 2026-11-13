const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});

export async function onRequestGet({env,request}){
  const id=(new URL(request.url).searchParams.get("id")||"").trim();
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))return J({error:"bad id"},400);

  const stRow=await env.DB.prepare("SELECT id,data FROM docs WHERE coll='students' AND id=?").bind(id).first();
  if(!stRow)return J({error:"not found"},404);
  const st=JSON.parse(stRow.data);

  const rs=await env.DB.prepare("SELECT coll,id,data FROM docs WHERE coll IN ('attendance','payments','evaluations','classes','units')").all();
  const attendance=[],payments=[],evaluations=[],classes=[],units=[];
  for(const r of rs.results){
    const d=JSON.parse(r.data);
    if(r.coll==="attendance"){
      attendance.push({id:r.id,hadir:!!(d.ids&&d.ids[id])});
    }else if(r.coll==="payments"){
      payments.push({id:r.id,lunas:!!(d.ids&&d.ids[id])});
    }else if(r.coll==="evaluations"){
      if(d.ev&&d.ev[id])evaluations.push({id:r.id,date:d.date||r.id.slice(0,10),coach:d.coach||"Pelatih",...d.ev[id]});
    }else if(r.coll==="classes"){
      classes.push({id:r.id,...d});
    }else if(r.coll==="units"){
      units.push({id:r.id,...d});
    }
  }
  const sUnit=st.unit||"Terazza";
  const uDoc=units.find(u=>String(u.name||"").toLowerCase()===sUnit.toLowerCase());
  const uFee=(uDoc&&Number(uDoc.fee)>0)?Number(uDoc.fee):500000;
  const hasCustom=st.fee!==undefined&&st.fee!==null&&st.fee!==""&&Number(st.fee)>=0;
  const fee=hasCustom?Number(st.fee):uFee;

  return J({
    student:{
      id:stRow.id,
      n:st.n,
      unit:sUnit,
      fee,
      a:st.a,
      bi:st.bi,
      v:st.v,
      sejak:st.sejak||"",
      siap:!!st.siap,
      cuti:!!st.cuti,
      cutiKet:st.cutiKet||"",
      cutiTgl:st.cutiTgl||"",
      note:st.note||"",
      sk:st.sk||{}
    },
    attendance,
    payments,
    evaluations,
    classes
  });
}
