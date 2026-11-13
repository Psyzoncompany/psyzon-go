import sharp from "sharp";
import { authenticateFirebaseRequest } from "./firebase-rest";
import { enforceImageRateLimit } from "./financial-security";

const headers={"cache-control":"private, no-store","x-content-type-options":"nosniff"};
type Dependencies={authenticate:typeof authenticateFirebaseRequest;rateLimit:typeof enforceImageRateLimit};
export function createImageOptimizer({authenticate,rateLimit}:Dependencies){
  return async(request:Request)=>{
    try{
      if(request.headers.get("origin")&&request.headers.get("origin")!==new URL(request.url).origin)return Response.json({error:"Origem inválida."},{status:403,headers});
      const identity=await authenticate(request);
      const parameters=new URL(request.url).searchParams;
      const dimension=Number(parameters.get("dimension")??1200),limit=Number(parameters.get("limit")??450000),quality=Number(parameters.get("minimumQuality")??.5);
      if(!Number.isInteger(dimension)||dimension<128||dimension>1200||!Number.isInteger(limit)||limit<1024||limit>450000||!Number.isFinite(quality)||quality<.2||quality>.82)return Response.json({error:"Parâmetros da foto inválidos."},{status:400,headers});
      if(!/^image\/(png|jpeg|webp)$/.test(request.headers.get("content-type")??""))return Response.json({error:"Use uma foto JPG, PNG ou WebP."},{status:415,headers});
      if(Number(request.headers.get("content-length"))>3000000)return Response.json({error:"Foto muito grande."},{status:413,headers});
      const allowance=await rateLimit(identity,request);
      if(!allowance.allowed)return Response.json({error:"Aguarde um pouco antes de converter mais fotos."},{status:429,headers:{...headers,"retry-after":String(allowance.retryAfter)}});
      const reader=request.body?.getReader();if(!reader)return Response.json({error:"Envie uma foto."},{status:400,headers});
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>3000000){await reader.cancel();return Response.json({error:"Foto muito grande."},{status:413,headers});}chunks.push(part.value);}
      const input=Buffer.concat(chunks);
      const metadata=await sharp(input,{limitInputPixels:40000000}).metadata();
      if(!["jpeg","png","webp"].includes(metadata.format??"")||(metadata.pages??1)>1)return Response.json({error:"Formato da foto inválido."},{status:415,headers});
      let side=dimension;
      for(let attempt=0;attempt<8;attempt++){
        for(const q of [82,Math.round(quality*100)]){
          const output=await sharp(input,{limitInputPixels:40000000}).rotate().resize({width:side,height:side,fit:"inside",withoutEnlargement:true}).webp({quality:q,effort:4}).toBuffer();
          if(4*Math.ceil(output.length/3)+23<=limit)return new Response(new Uint8Array(output),{headers:{...headers,"content-type":"image/webp"}});
        }
        side=Math.max(128,Math.round(side*.8));
      }
      return Response.json({error:"Escolha uma imagem menor."},{status:422,headers});
    }catch(error){const status=error instanceof Response?error.status:422;return Response.json({error:status===401?"Entre novamente para preparar a foto.":"Não foi possível converter a foto."},{status,headers});}
  };
}
export const optimizeImageRequest=createImageOptimizer({authenticate:authenticateFirebaseRequest,rateLimit:enforceImageRateLimit});
