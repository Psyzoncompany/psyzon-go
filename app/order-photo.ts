export type PhotoOptions = { dimension: number; limit: number; fallbackQuality: number };
let nativeWebp: boolean | undefined;

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Não foi possível preparar a foto."));reader.readAsDataURL(blob);});
}

async function compatibleWebp(canvas: HTMLCanvasElement, options: PhotoOptions) {
  const { getAuth }=await import("firebase/auth");
  const token=await getAuth().currentUser?.getIdToken();
  if(!token)throw new Error("Entre novamente para preparar a foto.");
  let blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
  while(blob&&blob.size>3000000&&canvas.width>160){
    const smaller=document.createElement("canvas");smaller.width=Math.max(1,Math.round(canvas.width*.8));smaller.height=Math.max(1,Math.round(canvas.height*.8));
    smaller.getContext("2d")!.drawImage(canvas,0,0,smaller.width,smaller.height);canvas=smaller;
    blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
  }
  if(!blob)throw new Error("Não foi possível preparar a foto.");
  const query=new URLSearchParams({dimension:String(options.dimension),limit:String(options.limit),minimumQuality:String(options.fallbackQuality)});
  const response=await fetch("/api/images/optimize?"+query,{method:"POST",headers:{authorization:"Bearer "+token,"content-type":blob.type},body:blob,signal:AbortSignal.timeout(30000)});
  if(!response.ok){const result=await response.json().catch(()=>null);throw new Error(result?.error||"Não foi possível converter a foto. Tente novamente.");}
  if(!response.headers.get("content-type")?.startsWith("image/webp"))throw new Error("Conversão da foto indisponível.");
  return dataUrl(await response.blob());
}

export async function prepareOrderPhoto(file: File, options: PhotoOptions) {
  const { dimension, limit, fallbackQuality }=options;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Use uma foto JPG, PNG ou WebP de até 10 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw new Error("Escolha uma imagem de até 40 megapixels.");
    let scale = Math.min(1, dimension / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto.");
    nativeWebp ??= canvas.toDataURL("image/webp",.82).startsWith("data:image/webp;");
    for(let attempt=0;attempt<8;attempt++){
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      let result=nativeWebp?canvas.toDataURL("image/webp",.82):await compatibleWebp(canvas,options);
      if(nativeWebp&&result.length>limit)result=canvas.toDataURL("image/webp",fallbackQuality);
      if(result.startsWith("data:image/webp;")&&result.length<=limit)return result;
      scale*=.8;
    }
    throw new Error("A foto ainda ficou muito grande. Escolha uma imagem menor.");
  } finally { bitmap.close(); }
}

export async function optimizeStoredPhoto(source: string, options: PhotoOptions) {
  const match=/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(source);
  if(!match)return source;
  const bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));
  const converted=await prepareOrderPhoto(new File([bytes],"referencia",{type:match[1]}),options);
  return converted.length<source.length*.98?converted:source;
}
