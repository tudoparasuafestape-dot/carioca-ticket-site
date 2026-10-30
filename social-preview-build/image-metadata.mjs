// Read headers only; never modifies or decodes image pixels.
const deny=()=>{throw new Error('CT_IMAGE_METADATA_DENIED: invalid image header')};
const dimensions=(mime,width,height)=>{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>65535||height>65535)deny();
 return Object.freeze({mime,width,height});
};
export function imageMetadata(bytes,filename){
 if(!Buffer.isBuffer(bytes)||bytes.length<24||bytes.length>8e6)deny();
 if(/\.png$/i.test(filename)){
  if(bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR')deny();
  return dimensions('image/png',bytes.readUInt32BE(16),bytes.readUInt32BE(20));
 }
 if(!/\.jpe?g$/i.test(filename)||bytes[0]!==255||bytes[1]!==216)deny();
 let at=2;
 while(at<bytes.length){
  if(bytes[at++]!==255)deny();
  while(at<bytes.length&&bytes[at]===255)at++;
  if(at>=bytes.length)deny();
  const marker=bytes[at++];
  if(marker===0||marker===216||marker===217||marker===218||marker===1||(marker>=208&&marker<=215))deny();
  if(at+2>bytes.length)deny();
  const length=bytes.readUInt16BE(at);
  if(length<2||at+length>bytes.length)deny();
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
   if(length<11)deny();
   const components=bytes[at+7];
   if(components<1||components>4||length!==8+3*components)deny();
   return dimensions('image/jpeg',bytes.readUInt16BE(at+5),bytes.readUInt16BE(at+3));
  }
  at+=length;
 }
 deny();
}
