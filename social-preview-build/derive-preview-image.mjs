import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import {imageMetadata} from './image-metadata.mjs';
export function derivePreviewImage(bytes){
 const run=spawnSync('python3',[new URL('./derive-preview-image.py',import.meta.url).pathname],{input:bytes,timeout:30000,maxBuffer:8000000,windowsHide:true});
 if(run.error||run.status!==0)throw Error('CT_PREVIEW_IMAGE_DENIED: mechanical conversion failed');
 const body=run.stdout,metadata=imageMetadata(body,'preview.jpg');
 if(metadata.width>1200||metadata.height>1200)throw Error('CT_PREVIEW_IMAGE_DENIED: dimensions');
 const digest=crypto.createHash('sha256').update(body).digest('hex');
 return {body,metadata,path:'assets/social-previews/'+digest+'.jpg'};
}
