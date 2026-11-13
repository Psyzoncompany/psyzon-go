import { maxDtfPrintPhoto } from "./dtf-model";
import type { PhotoOptions } from "./order-photo";

const legacyPhoto=(value:unknown):value is string=>typeof value==="string"&&/^data:image\/(jpeg|png);base64,/.test(value);
const ordinary:PhotoOptions={dimension:1200,limit:450000,fallbackQuality:.5};
export function unchangedPhotoPatch(current:Record<string,unknown>,source:Record<string,string>,patch:Record<string,string>) {
  return Object.fromEntries(Object.entries(patch).filter(([field])=>Object.hasOwn(source,field)&&current[field]===source[field]));
}
export function legacyPhotoFields(data:Record<string,unknown>) {
  return Object.fromEntries(["photoData","productionPhotoData","referencePhotos","printsData"].flatMap(key=>{
    const value=data[key];return typeof value==="string"&&(legacyPhoto(value)||((key==="referencePhotos"||key==="printsData")&&/data:image\/(jpeg|png);base64,/.test(value)))?[[key,value]]:[];
  }));
}

export async function optimizePhotoFields(fields:Record<string,string>,convert:(source:string,options:PhotoOptions)=>Promise<string>) {
  const patch:Record<string,string>={};
  const smaller=async(source:string,options:PhotoOptions)=>{
    if(!legacyPhoto(source))return source;
    const result=await convert(source,options);
    return result.startsWith("data:image/webp;")&&result.length<source.length*.98?result:source;
  };
  for(const [key,source] of Object.entries(fields)){
    let next=source;
    if(key==="photoData"||key==="productionPhotoData")next=await smaller(source,ordinary);
    else{
      let values:unknown;try{values=JSON.parse(source);}catch{continue;}
      if(!Array.isArray(values)||values.length>50)continue;
      let changed=false;const result=[];
      for(const value of values){
        if(key==="referencePhotos"&&typeof value==="string"){
          const converted=await smaller(value,{dimension:640,limit:55000,fallbackQuality:.3});changed ||=converted!==value;result.push(converted);
        }else if(key==="printsData"&&value&&typeof value==="object"&&typeof value.photoData==="string"){
          const converted=await smaller(value.photoData,{dimension:300,limit:maxDtfPrintPhoto,fallbackQuality:.26});changed ||=converted!==value.photoData;result.push({...value,photoData:converted});
        }else result.push(value);
      }
      if(changed)next=JSON.stringify(result);
    }
    if(next!==source)patch[key]=next;
  }
  return patch;
}
