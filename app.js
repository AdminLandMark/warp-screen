const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const ICON = { ig:'📸', fb:'💙', tt:'🎵' };
const esc = s => (s||'').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const money = n => Number(n).toFixed(2);

async function getSettings(){
  const { data } = await sb.from('settings').select('*').eq('id',1).single();
  return data;
}

/* ---- PromptPay EMVCo ---- */
const crc16 = s => { let c=0xFFFF;
  for(const ch of s){ c ^= ch.charCodeAt(0)<<8;
    for(let j=0;j<8;j++) c = (c&0x8000) ? ((c<<1)^0x1021)&0xFFFF : (c<<1)&0xFFFF; }
  return c.toString(16).toUpperCase().padStart(4,'0'); };

function ppPayload(target, amt){
  const f=(i,v)=>i+String(v.length).padStart(2,'0')+v;
  const n=String(target).replace(/\D/g,'');
  const acc = n.length===13 ? f('02',n) : f('01','0066'+n.replace(/^0/,''));
  const p = f('00','01')+f('01','12')+f('29',f('00','A000000677010111')+acc)
          + f('53','764')+f('54',Number(amt).toFixed(2))+f('58','TH');
  return p+'6304'+crc16(p+'6304');
}

/* ---- บังคับรูปเป็นแนวตั้ง 3:4 + เติมขอบเบลอ ---- */
function fitPortrait(file){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = e => { const i = new Image();
      i.onload = () => {
        const W=720,H=960,cv=document.createElement('canvas');
        cv.width=W; cv.height=H; const x=cv.getContext('2d');
        const cs=Math.max(W/i.width,H/i.height);
        x.filter='blur(30px)';
        x.drawImage(i,(W-i.width*cs)/2,(H-i.height*cs)/2,i.width*cs,i.height*cs);
        x.filter='none'; x.fillStyle='rgba(0,0,0,.32)'; x.fillRect(0,0,W,H);
        const ct=Math.min(W/i.width,H/i.height);
        x.drawImage(i,(W-i.width*ct)/2,(H-i.height*ct)/2,i.width*ct,i.height*ct);
        cv.toBlob(b=>res(b),'image/jpeg',.82);
      };
      i.onerror=rej; i.src=e.target.result; };
    r.readAsDataURL(file);
  });
}

/* ---- อ่าน QR ในสลิป (ฟรี ไม่ต้องต่อ API) ---- */
function readSlipQR(file){
  return new Promise(res=>{
    const r=new FileReader();
    r.onload=e=>{ const i=new Image();
      i.onload=()=>{
        for(const w of [i.width, 1600, 2400]){
          const s=w/i.width, cv=document.createElement('canvas');
          cv.width=i.width*s; cv.height=i.height*s;
          cv.getContext('2d').drawImage(i,0,0,cv.width,cv.height);
          const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height);
          const q=jsQR(d.data,d.width,d.height);
          if(q?.data) return res(q.data);
        }
        res(null);
      };
      i.src=e.target.result; };
    r.readAsDataURL(file);
  });
}

async function upload(bucket, path, blob){
  const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType:'image/jpeg', upsert:true });
  if(error) throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}