"use client";
import { useEffect, useRef } from "react";
import { getAuth } from "firebase/auth";
import { getApps } from "firebase/app";
import { doc, getFirestore, runTransaction, serverTimestamp } from "firebase/firestore";
import { legacyPhotoFields, optimizePhotoFields, unchangedPhotoPatch } from "./photo-migration";
import { optimizeStoredPhoto } from "./order-photo";

type PhotoRecord={id:string;photoData?:string;productionPhotoData?:string;referencePhotos?:string;printsData?:string};
type Job={collection:string;id:string;fields:Record<string,string>};
const pause=(delay:number)=>new Promise<void>(resolve=>window.setTimeout(resolve,delay));

function createOptimizer(uid:string){
  let stopped=false,running=false;
  const queue=new Map<string,Job>(),attempted=new Set<string>();
  const storageKey="psy-photo-webp-v1:"+uid;
  let completed=new Set<string>();try{const saved=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(saved))completed=new Set(saved.filter(key=>typeof key==="string").slice(-1000));}catch{}
  const available=()=>!stopped&&getAuth(getApps()[0]).currentUser?.uid===uid;
  const waitForIdle=async()=>{
    await pause(350);
    while(available()&&(document.visibilityState!=="visible"||!navigator.onLine||document.querySelector('.modal,.an-dialog,dialog[open]')||document.activeElement?.matches('input,textarea,[contenteditable="true"]')))await pause(1000);
    if(available())await new Promise<void>(resolve=>{"requestIdleCallback" in window?window.requestIdleCallback(()=>resolve(),{timeout:2000}):globalThis.setTimeout(resolve,100);});
  };
  const drain=async()=>{
    if(running)return;running=true;
    try{
      await pause(3000);
      while(available()&&queue.size){
        await waitForIdle();if(!available())break;
        const [path,job]=queue.entries().next().value!;queue.delete(path);
        const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(job.fields)));
        const key=path+":"+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");
        if(completed.has(key)||attempted.has(key))continue;attempted.add(key);
        try{
          const patch=await optimizePhotoFields(job.fields,async(source,options)=>{await waitForIdle();if(!available())throw new Error("Cancelled");return optimizeStoredPhoto(source,options);});
          if(!available())break;
          if(Object.keys(patch).length)await runTransaction(getFirestore(getApps()[0]),async transaction=>{
            if(!available())return;
            const reference=doc(getFirestore(getApps()[0]),"users",uid,job.collection,job.id);
            const current=await transaction.get(reference);if(!current.exists())return;
            const unchanged=unchangedPhotoPatch(current.data(),job.fields,patch);
            if(Object.keys(unchanged).length&&available())transaction.update(reference,{...unchanged,...(job.collection==="dtfOrders"?{updatedAt:serverTimestamp()}:{})});
          });
          completed.add(key);completed=new Set([...completed].slice(-1000));try{localStorage.setItem(storageKey,JSON.stringify([...completed]));}catch{}
        }catch{/* Preserve the original. A later session can retry a failed conversion. */}
      }
    }finally{running=false;}
  };
  return {
    add(collection:string,records:PhotoRecord[]){for(const record of records){const fields=legacyPhotoFields(record);if(Object.keys(fields).length)queue.set(collection+"/"+record.id,{collection,id:record.id,fields});}void drain().catch(()=>{});},
    stop(){stopped=true;queue.clear();},
  };
}

export default function PhotoOptimization({uid,orders,notes,dtfOrders}:{uid:string;orders:PhotoRecord[];notes:PhotoRecord[];dtfOrders:PhotoRecord[]}){
  const optimizer=useRef<ReturnType<typeof createOptimizer>|null>(null);
  useEffect(()=>{const instance=createOptimizer(uid);optimizer.current=instance;return()=>{instance.stop();optimizer.current=null;};},[uid]);
  useEffect(()=>{const instance=optimizer.current;instance?.add("orders",orders);instance?.add("notes",notes);instance?.add("dtfOrders",dtfOrders);},[uid,orders,notes,dtfOrders]);
  return null;
}
