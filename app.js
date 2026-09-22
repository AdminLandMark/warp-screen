const sb = supabase.createClient(
  CFG.SUPABASE_URL,
  CFG.SUPABASE_ANON_KEY
);

const ICON = {
  ig:'📸',
  fb:'💙',
  tt:'🎵'
};


/* =========================================================
   HELPERS
========================================================= */

const esc = s => (s || '').replace(
  /[<>&"]/g,
  c => ({
    '<':'&lt;',
    '>':'&gt;',
    '&':'&amp;',
    '"':'&quot;'
  }[c])
);


const money = n =>
  Number(n).toFixed(2);


/* =========================================================
   SETTINGS
========================================================= */

async function getSettings(){

  const { data, error } =
    await sb
      .from('settings')
      .select('*')
      .eq('id',1)
      .single();

  if(error){

    console.error(
      'GET SETTINGS ERROR:',
      error
    );

    return null;
  }

  return data;
}


/* =========================================================
   PROMPTPAY EMVCo
========================================================= */

const crc16 = s => {

  let c = 0xFFFF;

  for(const ch of s){

    c ^= ch.charCodeAt(0) << 8;

    for(let j=0;j<8;j++){

      c =
        (c & 0x8000)
        ? ((c << 1) ^ 0x1021) & 0xFFFF
        : (c << 1) & 0xFFFF;

    }
  }

  return c
    .toString(16)
    .toUpperCase()
    .padStart(4,'0');

};


function ppPayload(target, amt){

  const f = (i,v) =>
    i + String(v.length).padStart(2,'0') + v;


  const n =
    String(target)
      .replace(/\D/g,'');


  const acc =
    n.length === 13

      ? f('02',n)

      : f(
          '01',
          '0066' +
          n.replace(/^0/,'')
        );


  const p =
      f('00','01')
    + f('01','12')
    + f(
        '29',
        f(
          '00',
          'A000000677010111'
        ) + acc
      )
    + f('53','764')
    + f(
        '54',
        Number(amt).toFixed(2)
      )
    + f('58','TH');


  return p +
    '6304' +
    crc16(
      p + '6304'
    );
}


/* =========================================================
   IMAGE
   บังคับรูปเป็นแนวตั้ง 3:4
   + เติมขอบเบลอ
========================================================= */

function fitPortrait(file){

  return new Promise((res, rej)=>{

    const r =
      new FileReader();


    r.onload = e => {

      const i =
        new Image();


      i.onload = () => {

        const W = 720;
        const H = 960;

        const cv =
          document.createElement(
            'canvas'
          );


        cv.width = W;
        cv.height = H;


        const x =
          cv.getContext('2d');


        /*
          พื้นหลังเบลอ
        */

        const cs =
          Math.max(
            W / i.width,
            H / i.height
          );


        x.filter =
          'blur(30px)';


        x.drawImage(
          i,
          (W - i.width * cs) / 2,
          (H - i.height * cs) / 2,
          i.width * cs,
          i.height * cs
        );


        /*
          Overlay ดำบาง ๆ
        */

        x.filter = 'none';

        x.fillStyle =
          'rgba(0,0,0,.32)';

        x.fillRect(
          0,
          0,
          W,
          H
        );


        /*
          รูปหลัก
        */

        const ct =
          Math.min(
            W / i.width,
            H / i.height
          );


        x.drawImage(
          i,
          (W - i.width * ct) / 2,
          (H - i.height * ct) / 2,
          i.width * ct,
          i.height * ct
        );


        /*
          JPEG
        */

        cv.toBlob(
          b => res(b),
          'image/jpeg',
          .82
        );

      };


      i.onerror = rej;

      i.src =
        e.target.result;

    };


    r.readAsDataURL(file);

  });

}


/* =========================================================
   READ QR FROM SLIP
   ฟรี ไม่ต้องต่อ API
========================================================= */

function readSlipQR(file){

  return new Promise(res => {

    const r =
      new FileReader();


    r.onload = e => {

      const i =
        new Image();


      i.onload = () => {

        /*
          ทดลองหลายขนาด
        */

        for(
          const w
          of [
            i.width,
            1600,
            2400
          ]
        ){

          const s =
            w / i.width;


          const cv =
            document.createElement(
              'canvas'
            );


          cv.width =
            i.width * s;

          cv.height =
            i.height * s;


          const ctx =
            cv.getContext('2d');


          ctx.drawImage(
            i,
            0,
            0,
            cv.width,
            cv.height
          );


          const d =
            ctx.getImageData(
              0,
              0,
              cv.width,
              cv.height
            );


          /*
            jsQR ต้องมี script
            อยู่ในหน้าเว็บ
          */

          if(
            typeof jsQR ===
            'undefined'
          ){

            console.warn(
              'jsQR library not found'
            );

            return res(null);
          }


          const q =
            jsQR(
              d.data,
              d.width,
              d.height
            );


          if(q?.data){

            return res(
              q.data
            );

          }

        }


        res(null);

      };


      i.onerror = () =>
        res(null);


      i.src =
        e.target.result;

    };


    r.onerror = () =>
      res(null);


    r.readAsDataURL(file);

  });

}


/* =========================================================
   UPLOAD
========================================================= */

async function upload(
  bucket,
  path,
  blob
){

  const { error } =
    await sb.storage
      .from(bucket)
      .upload(
        path,
        blob,
        {
          contentType:
            'image/jpeg',

          upsert:
            true
        }
      );


  if(error){

    console.error(
      'UPLOAD ERROR:',
      error
    );

    throw error;
  }


  return sb.storage
    .from(bucket)
    .getPublicUrl(path)
    .data
    .publicUrl;

}
