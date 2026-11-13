const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const REPO="chubzknight-ux/dojang-hq";

const b64=str=>{
  const bytes=new TextEncoder().encode(str);
  let bin="";
  for(const b of bytes)bin+=String.fromCharCode(b);
  return btoa(bin);
};

async function gh(token,path,opt={}){
  const res=await fetch("https://api.github.com/repos/"+REPO+path,{
    ...opt,
    headers:{
      "Authorization":"Bearer "+token,
      "Accept":"application/vnd.github+json",
      "User-Agent":"Dojang-HQ-Updater",
      "Content-Type":"application/json",
      ...(opt.headers||{})
    }
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.message||("GitHub HTTP "+res.status));
  return data;
}

export async function onRequestPost({env,request}){
  const pin=(request.headers.get("X-Dojang-Pin")||"").trim();
  if(!env.ADMIN_PIN||pin!==env.ADMIN_PIN)return J({error:"PIN Admin salah"},403);

  const body=await request.json().catch(()=>null);
  if(!body||!body.token||!Array.isArray(body.files)||!body.files.length){
    return J({error:"Token GitHub atau daftar file tidak lengkap"},400);
  }

  const token=body.token.trim();
  const mode=body.mode==="pr"?"pr":"direct";
  const title=(body.title||"Update fitur Dojang HQ").trim();

  try{
    let targetBranch="main";
    if(mode==="pr"){
      const mainRef=await gh(token,"/git/ref/heads/main");
      targetBranch="update-"+Date.now().toString(36);
      await gh(token,"/git/refs",{
        method:"POST",
        body:JSON.stringify({ref:"refs/heads/"+targetBranch,sha:mainRef.object.sha})
      });
    }

    for(const f of body.files){
      if(!f.path||typeof f.content!=="string")continue;
      let sha=undefined;
      try{
        const cur=await gh(token,"/contents/"+f.path+"?ref="+targetBranch);
        sha=cur.sha;
      }catch(e){}
      await gh(token,"/contents/"+f.path,{
        method:"PUT",
        body:JSON.stringify({
          message:title+" ("+f.path+")",
          content:b64(f.content),
          branch:targetBranch,
          ...(sha?{sha}:{})
        })
      });
    }

    if(mode==="pr"){
      const pr=await gh(token,"/pulls",{
        method:"POST",
        body:JSON.stringify({
          title,
          head:targetBranch,
          base:"main",
          body:"Pembaruan otomatis dari panel Dojang HQ."
        })
      });
      return J({ok:true,mode:"pr",prUrl:pr.html_url,branch:targetBranch});
    }

    return J({ok:true,mode:"direct",branch:"main"});
  }catch(err){
    return J({error:err.message||"Gagal update ke GitHub"},500);
  }
}
