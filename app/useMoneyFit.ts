"use client";
import { useLayoutEffect, type RefObject } from "react";
export default function useMoneyFit(ref: RefObject<HTMLSpanElement|null>, label: string) {
  useLayoutEffect(()=>{
    const node=ref.current,parent=node?.parentElement;
    if(!node||!parent||!label.includes("R$"))return;
    const context=document.createElement("canvas").getContext("2d");if(!context)return;
    let disposed=false,frameId=0;
    const fit=()=>{
      if(disposed)return;
      const style=getComputedStyle(parent),size=parseFloat(style.fontSize);
      context.font=`${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
      const frame=node.hasAttribute("data-tweening")?node.querySelector("i")?.getAttribute("data-frame"):null;
      const measure=(text:string)=>context.measureText(text).width+Math.max(0,text.length-1)*(parseFloat(style.letterSpacing)||0);
      const natural=Math.max(measure(label),frame?measure(frame):0);
      const available=parent.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0);
      if(available>0&&natural>0){const next=natural>available-1?`${Math.min(size,size*Math.max(1,available-1)/natural)}px`:"";if(node.style.fontSize!==next)node.style.fontSize=next;}
    };
    const schedule=()=>{cancelAnimationFrame(frameId);frameId=requestAnimationFrame(fit);};
    fit();const observer=new ResizeObserver(schedule);observer.observe(parent);
    const theme=new MutationObserver(schedule);theme.observe(document.documentElement,{attributes:true,attributeFilter:["style","class","data-ui-theme","data-ui-size"]});
    void document.fonts.ready.then(schedule);const timer=window.setTimeout(schedule,750);
    return()=>{disposed=true;observer.disconnect();theme.disconnect();window.clearTimeout(timer);cancelAnimationFrame(frameId);};
  },[ref,label]);
}
