const J=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const safeEq=(a,b)=>{a=String(a||"");b=String(b||"");if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0;};
const MODES={
  poomsae:"Video menunjukkan jurus (Poomsae). Nilai Poomsae (ketepatan gerakan, kuda-kuda, keseimbangan, transisi). Kyorugi = null.",
  kyorugi:"Video menunjukkan sparring/tendangan (Kyorugi). Nilai Kyorugi (kuda-kuda tempur, posisi guard, jarak, tinggi & teknik tendangan). Poomsae = null.",
  umum:"Video latihan umum (dasar, tendangan, atau drill). Nilai hanya aspek yang terlihat jelas, sisanya null."
};
const SYSTEM=`Kamu asisten pelatih Taekwondo di dojang anak-anak. Kamu menerima gambar diam berurutan dari satu video latihan seorang murid dan membuat penilaian.
Aturan:
- Skala 1-5 (1 = perlu banyak latihan, 3 = cukup untuk levelnya, 5 = sangat baik untuk level sabuk dan usianya). Sesuaikan harapan dengan sabuk dan usia.
- Beri null untuk aspek yang tidak bisa dinilai dari gambar (misalnya Disiplin atau Kekuatan jika tidak terlihat jelas).
- Gambar diam tidak menunjukkan kecepatan dan tenaga. Jangan menilai itu kecuali jelas terlihat; sebut sebagai keterbatasan.
- Fokus pada teknik: kuda-kuda, keseimbangan, posisi tangan dan kaki, tinggi tendangan, pandangan, kerapian transisi.
- Jangan mengidentifikasi orang dan jangan berkomentar tentang tubuh atau penampilan fisik.
- Bahasa ramah, positif, konstruktif, aman untuk anak.
- Jawab HANYA JSON valid, tanpa teks lain, dengan bentuk:
{"poomsae":1-5|null,"kyorugi":1-5|null,"kekuatan":1-5|null,"kelenturan":1-5|null,"disiplin":1-5|null,"catatan":"2-4 kalimat","saran":["maks 3 saran latihan singkat"],"keyakinan":"rendah|sedang|tinggi"}`;

async function viaCF(env,frames,text){
  if(!env.AI)return {err:"Workers AI belum dipasang (Settings > Bindings > Workers AI, nama variabel: AI)"};
  const pick=frames.length>4?[0,1,2,3].map(i=>frames[Math.round(i*(frames.length-1)/3)]):frames;
  const content=[{type:"text",text}];
  pick.forEach(data=>content.push({type:"image_url",image_url:{url:"data:image/jpeg;base64,"+data}}));
  let r;
  try{
    r=await env.AI.run(env.CF_MODEL||"@cf/meta/llama-4-scout-17b-16e-instruct",{messages:[{role:"system",content:SYSTEM},{role:"user",content}],max_tokens:700});
  }catch(e){
    const m=String((e&&e.message)||e);
    return {err:/3036|neuron|limit/i.test(m)?"Kuota gratis Workers AI hari ini habis, coba lagi besok (reset 07.00 WIB)":"Workers AI error: "+m.slice(0,160)};
  }
  const raw=typeof r==="string"?r:(r&&(r.response||(r.result&&r.result.response)||(r.choices&&r.choices[0]&&r.choices[0].message&&r.choices[0].message.content)))||"";
  return {raw:typeof raw==="string"?raw:JSON.stringify(raw)};
}

async function viaGemini(env,frames,text){
  const model=env.GEMINI_MODEL||"gemini-3.8-flash";
  let res;
  try{
    res=await fetch("https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",{
      method:"POST",
      headers:{"content-type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:SYSTEM}]},
        contents:[{role:"user",parts:[...frames.map(data=>({inline_data:{mime_type:"image/jpeg",data}})),{text}]}],
        generationConfig:{responseMimeType:"application/json",maxOutputTokens:2000}
      })
    });
  }catch(e){return {err:"Gagal menghubungi layanan analisa"};}
  if(!res.ok){
    const e=await res.json().catch(()=>null);
    const base=res.status===429?"Kuota gratis habis atau terlalu cepat, coba lagi beberapa menit lagi":(res.status===400||res.status===403)?"API key Gemini salah atau belum aktif":res.status===404?"Model tidak ditemukan, ubah variabel GEMINI_MODEL":"Layanan analisa error ("+res.status+")";
    return {err:base+((e&&e.error&&e.error.message)?" — "+String(e.error.message).slice(0,160):"")};
  }
  const data=await res.json().catch(()=>null);
  const parts=(data&&data.candidates&&data.candidates[0]&&data.candidates[0].content&&data.candidates[0].content.parts)||[];
  return {raw:parts.map(p=>p.text||"").join("")};
}

async function viaClaude(env,frames,text){
  const content=frames.map(data=>({type:"image",source:{type:"base64",media_type:"image/jpeg",data}}));
  content.push({type:"text",text});
  let res;
  try{
    res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:env.ANALYZE_MODEL||"claude-sonnet-5-5",max_tokens:900,system:SYSTEM,messages:[{role:"user",content}]})});
  }catch(e){return {err:"Gagal menghubungi layanan analisa"};}
  if(!res.ok){
    return {err:res.status===401?"API key salah atau belum aktif":res.status===429?"Terlalu banyak permintaan, coba lagi sebentar":res.status===529?"Layanan sedang sibuk, coba lagi":"Layanan analisa error ("+res.status+")"};
  }
  const data=await res.json().catch(()=>null);
  return {raw:((data&&data.content)||[]).filter(b=>b.type==="text").map(b=>b.text).join("")};
}

export async function onRequestPost({request,env}){
  if((!env.AI&&!env.GEMINI_API_KEY&&!env.ANTHROPIC_API_KEY)||!env.ANALYZE_PIN)return J({error:"Server belum diatur: pasang Workers AI (gratis) dan isi ANALYZE_PIN di Cloudflare, lalu deploy ulang"},500);
  if(!safeEq(request.headers.get("X-Dojang-Pin"),env.ANALYZE_PIN))return J({error:"PIN salah"},403);
  if(Number(request.headers.get("content-length")||0)>8000000)return J({error:"Data terlalu besar"},413);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object")return J({error:"bad body"},400);
  const frames=Array.isArray(body.frames)?body.frames:[];
  if(frames.length<4||frames.length>12||!frames.every(f=>typeof f==="string"&&f.length<900000&&/^[A-Za-z0-9+/=]+$/.test(f)))return J({error:"Gambar tidak valid (4-12 gambar)"},400);
  const mode=MODES[body.mode]?body.mode:"umum";
  const st=body.student||{};
  const age=Number(st.age)>0?Math.min(99,Number(st.age)):null;
  const belt=String(st.belt||"").slice(0,40);
  const text=`${MODES[mode]}\nUsia murid: ${age?age+" tahun":"tidak diketahui"}. Sabuk: ${belt||"tidak diketahui"}.\nBerikut ${frames.length} gambar berurutan dari awal sampai akhir video. Tulis catatan dan saran dalam bahasa ${body.lang==="en"?"Inggris":"Indonesia"}.`;
  const prov=env.ANALYZE_PROVIDER||(env.AI?"cf":env.ANTHROPIC_API_KEY?"claude":"gemini");
  const out=prov==="cf"?await viaCF(env,frames,text):prov==="claude"?await viaClaude(env,frames,text):await viaGemini(env,frames,text);
  if(out.err)return J({error:out.err},502);
  const raw=out.raw;
  const m=raw.match(/\{[\s\S]*\}/);
  let p=null;
  try{p=m?JSON.parse(m[0]):null;}catch(e){}
  if(!p)return J({error:"Hasil analisa tidak terbaca, coba ulangi"},502);
  const sc=v=>{const n=Math.round(Number(v));return n>=1&&n<=5?n:null;};
  const result={
    poomsae:sc(p.poomsae),kyorugi:sc(p.kyorugi),kekuatan:sc(p.kekuatan),kelenturan:sc(p.kelenturan),disiplin:sc(p.disiplin),
    catatan:String(p.catatan||"").slice(0,800),
    saran:(Array.isArray(p.saran)?p.saran:[]).slice(0,3).map(x=>String(x).slice(0,200)),
    keyakinan:["rendah","sedang","tinggi"].includes(p.keyakinan)?p.keyakinan:"sedang"
  };
  return J({ok:true,result});
}