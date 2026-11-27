const signature=[137,80,78,71,13,10,26,10];
const tag=(v,at)=>String.fromCharCode(v.getUint8(at),v.getUint8(at+1),v.getUint8(at+2),v.getUint8(at+3));
export function inspectPng(buffer){
 const v=new DataView(buffer),s=v.byteLength;
 if(s<45||s>4194304||!signature.every((x,i)=>v.getUint8(i)===x))throw Error('PNG_INVALIDO');
 let at=8,gotData=false,gotEnd=false,width=0,height=0,blocks=0;
 while(at+12<=s){
  const n=v.getUint32(at),k=tag(v,at+4),end=at+n+12;
  if(end>s||++blocks>2000)throw Error('PNG_INVALIDO');
  if(at===8){
   if(k!=='IHDR'||n!==13)throw Error('PNG_INVALIDO');
   width=v.getUint32(at+8);height=v.getUint32(at+12);
   if(!width||!height||width*height>12000000)throw Error('DIMENSOES_INVALIDAS');
  }else if(k==='IHDR'||['acTL','fcTL','fdAT'].includes(k))throw Error('CAPA_DEVE_SER_ESTATICA');
  if(k==='IDAT'&&n>0)gotData=true;
  if(k==='IEND'){if(n!==0||end!==s)throw Error('PNG_INVALIDO');gotEnd=true;break;}
  at=end;
 }
 if(!gotData||!gotEnd)throw Error('PNG_INVALIDO');
 // Structural check only. Browser decode and independent server attestation
 // are separate checks; never publish solely on this function's result.
 return {width,height,static:true};
}

// JPEG is an input convenience only; the stored artifact is a sanitized,
// bounded, browser-encoded PNG. Read its dimensions before decoding pixels.
export function inspectJpegSize(buffer){
 const v=new DataView(buffer),size=v.byteLength;
 if(size<24||size>4194304||v.getUint16(0)!==0xffd8)throw Error('JPEG_INVALIDO');
 for(let at=2,count=0;at+4<size&&++count<=1024;){
  if(v.getUint8(at++)!==255)throw Error('JPEG_INVALIDO');
  while(at<size&&v.getUint8(at)===255)at++;
  if(at+3>=size)break;
  const marker=v.getUint8(at++);
  if(marker===0xda||marker===0xd9||marker===0xd8||marker===0)break;
  const n=v.getUint16(at);
  if(n<2||at+n>size)throw Error('JPEG_INVALIDO');
  if(marker===0xc0||marker===0xc2){
   if(n<8||v.getUint8(at+2)!==8)throw Error('JPEG_INVALIDO');
   const height=v.getUint16(at+3),width=v.getUint16(at+5);
   if(!width||!height||width*height>12000000)throw Error('DIMENSOES_INVALIDAS');
   return {width,height};
  }
  at+=n;
 }
 throw Error('JPEG_INVALIDO');
}

export async function prepareCoverInput(file){
 if(!file)return null;
 if(file.type==='image/png')return file;
 if(file.type!=='image/jpeg'||file.size<24||file.size>4194304)throw Error('ARQUIVO_INVALIDO');
 const meta=inspectJpegSize(await file.arrayBuffer());
 const src=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=src;await img.decode();
  const w=img.naturalWidth,h=img.naturalHeight;
  if(!w||!h||w*h>12000000||
     !((w===meta.width&&h===meta.height)||(h===meta.width&&w===meta.height)))
   throw Error('DIMENSOES_INVALIDAS');
  const canvas=document.createElement('canvas'),g=canvas.getContext('2d',{alpha:false});
  if(!g)throw Error('JPEG_CONVERSAO_INDISPONIVEL');
  const max=Math.max(w,h);
  for(const edge of [1600,1200,960]){
   const scale=Math.min(1,edge/max);
   canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
   g.drawImage(img,0,0,canvas.width,canvas.height);
   const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(png?.size>=45&&png.size<=4194304)return new File([png],'capa.png',{type:'image/png'});
  }
  throw Error('JPEG_CONVERSAO_INDISPONIVEL');
 }finally{URL.revokeObjectURL(src);}
}
