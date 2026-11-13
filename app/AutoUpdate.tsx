"use client";
import { useEffect } from "react";
import { prepareReloadEvent, type PrepareReload } from "./update-events";

export default function AutoUpdate(){
  useEffect(()=>{
    const current=process.env.NEXT_PUBLIC_PSYZON_BUILD;
    if(!current||current==="development")return;
    let checking=false,disposed=false;
    const dirtyForms=new Set<HTMLFormElement>();
    const dirty=(event:Event)=>{const target=event.target;if(target instanceof HTMLElement){const form=target.closest("form");if(form)dirtyForms.add(form);}};
    const hasEdits=()=>{
      if([...document.querySelectorAll('.modal,.an-dialog,[role="dialog"],dialog[open],[aria-busy="true"]')].some(element=>element.getClientRects().length>0))return true;
      for(const form of dirtyForms){if(!form.isConnected){dirtyForms.delete(form);continue;}if([...form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),textarea')].some(field=>field.value.trim()))return true;dirtyForms.delete(form);}
      return document.activeElement instanceof HTMLElement&&document.activeElement.matches('textarea,input:not([type="checkbox"]):not([type="radio"]),[contenteditable="true"]');
    };
    const check=async()=>{
      if(checking||disposed||document.visibilityState!=="visible"||!navigator.onLine)return;
      checking=true;
      try{
        const response=await fetch('/api/version?t='+Date.now(),{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});if(!response.ok)return;
        const data=await response.json();if(typeof data.version!=="string"||data.version===current||data.version==="development"||hasEdits())return;
        const saves:Promise<boolean>[]=[];
        window.dispatchEvent(new CustomEvent<PrepareReload>(prepareReloadEvent,{detail:{waitUntil:promise=>saves.push(promise)}}));
        const saved=await Promise.all(saves);
        if(!disposed&&saved.every(Boolean)&&!hasEdits()){
          // Keep an old version response from causing a reload loop during rollout.
          const key='psy-last-auto-update';const previous=sessionStorage.getItem(key);const attempt=JSON.parse(previous||'null');
          if(attempt?.version===data.version&&Date.now()-attempt.time<120000)return;
          sessionStorage.setItem(key,JSON.stringify({version:data.version,time:Date.now()}));
          void navigator.serviceWorker?.getRegistration().then(registration=>registration?.update()).catch(()=>{});
          window.location.reload();
        }
      }catch{/* Retry after transient network failures. */}finally{checking=false;}
    };
    const timer=window.setInterval(()=>void check(),30000);
    const first=window.setTimeout(()=>void check(),5000);
    const resume=()=>{void check();};
    document.addEventListener('visibilitychange',resume);window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('input',dirty,true);document.addEventListener('change',dirty,true);
    return()=>{disposed=true;window.clearInterval(timer);window.clearTimeout(first);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('input',dirty,true);document.removeEventListener('change',dirty,true);};
  },[]);
  return null;
}
