import type { NoteDocument } from "./notes-model";
export function checklistCompletion(before: NoteDocument | undefined, after: NoteDocument) {
  if (!before) return undefined;
  const checks = (doc: NoteDocument) => [
    ...doc.blocks.filter(item=>item.type==="check").map(item=>({id:"block:"+item.id,done:!!item.done})),
    ...(doc.productionChecklist?.rows??[]).map(item=>({id:"piece:"+item.id,done:!!item.done})),
  ];
  const previous=new Map(checks(before).map(item=>[item.id,item.done]));
  const current=checks(after);
  if (!current.some(item=>item.done && previous.get(item.id)===false)) return undefined;
  const done=current.filter(item=>item.done).length,total=current.length;
  return {done,total,complete:done===total,progress:Math.round(done/total*100),previousProgress:Math.round(checks(before).filter(item=>item.done).length/Math.max(1,checks(before).length)*100)};
}
