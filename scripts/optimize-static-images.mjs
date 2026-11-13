import sharp from 'sharp';
import {mkdir,readdir,stat} from 'node:fs/promises';

await mkdir('public/studio-glass/mobile',{recursive:true});
let desktopBytes=0,mobileBytes=0;
for(const name of await readdir('public/studio-glass')){
  if(!name.endsWith('.webp')||name.includes('preview'))continue;
  const source='public/studio-glass/'+name;
  const metadata=await sharp(source).metadata();
  // Keep the same 57% horizontal focal point used by the mobile theme.
  const width=Math.round(metadata.height*9/16),left=Math.round((metadata.width-width)*.57);
  const target='public/studio-glass/mobile/'+name;
  await sharp(source).extract({left,top:0,width,height:metadata.height}).webp({quality:74,effort:6}).toFile(target);
  desktopBytes+=(await stat(source)).size;mobileBytes+=(await stat(target)).size;
}
await sharp('public/icon-192-v3.png').webp({quality:88,effort:6}).toFile('public/brand-mark.webp');
for(const name of ['screenshot-wide','screenshot-mobile'])await sharp('public/'+name+'.png').webp({quality:88,effort:6}).toFile('public/'+name+'.webp');
console.log(JSON.stringify({desktopBackgroundBytes:desktopBytes,mobileBackgroundBytes:mobileBytes,savedPercent:Math.round((1-mobileBytes/desktopBytes)*100)}));
