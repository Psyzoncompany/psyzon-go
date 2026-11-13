import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { createImageOptimizer } from "../app/lib/server/image-optimizer";
import { legacyPhotoFields, optimizePhotoFields, unchangedPhotoPatch } from "../app/photo-migration";
import { dtfPhotos, packDtfPhotos, changeDtfPrints, readDtfPrints } from "../app/dtf-model";
import type { FirebaseIdentity } from "../app/lib/server/firebase-rest";

const identity={uid:"owner"} as FirebaseIdentity;
const dependencies={authenticate:async()=>identity,rateLimit:async()=>({allowed:true,retryAfter:0})};
const request=(body:Uint8Array,url="http://localhost/api/images/optimize?dimension=300&limit=18000",headers={})=>new Request(url,{method:"POST",headers:{"content-type":"image/png",...headers},body:new Uint8Array(body)});

test("image conversion authenticates, rejects unsafe inputs and enforces size and rate limits",async()=>{
  const unauth=createImageOptimizer({...dependencies,authenticate:async()=>{throw new Response(null,{status:401});}});
  assert.equal((await unauth(request(new Uint8Array()))).status,401);
  const optimize=createImageOptimizer(dependencies);
  assert.equal((await optimize(request(new Uint8Array(),undefined,{origin:"https://other.test"}))).status,403);
  assert.equal((await optimize(request(new Uint8Array(),"http://localhost/api/images/optimize?dimension=50000"))).status,400);
  assert.equal((await optimize(request(new Uint8Array(),undefined,{"content-type":"image/svg+xml"}))).status,415);
  assert.equal((await optimize(request(new Uint8Array(3000001)))).status,413);
  assert.equal((await optimize(request(new Uint8Array([1,2,3])))).status,422);
  const limited=createImageOptimizer({...dependencies,rateLimit:async()=>({allowed:false,retryAfter:12})});
  const response=await limited(request(new Uint8Array()));assert.equal(response.status,429);assert.equal(response.headers.get("retry-after"),"12");
});

test("server compatibility encoder produces real bounded WebP, keeps alpha and removes metadata",async()=>{
  const source=await sharp({create:{width:1600,height:900,channels:4,background:{r:145,g:42,b:33,alpha:.45}}}).png().toBuffer();
  const response=await createImageOptimizer(dependencies)(request(source));
  assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"image/webp");assert.equal(response.headers.get("cache-control"),"private, no-store");
  const buffer=Buffer.from(await response.arrayBuffer());const metadata=await sharp(buffer).metadata();
  assert.equal(metadata.format,"webp");assert.equal(metadata.width,300);assert.equal(metadata.hasAlpha,true);assert.equal(metadata.exif,undefined);assert.ok(4*Math.ceil(buffer.length/3)+23<=18000);
});

test("photo migration updates image fields only and preserves DTF references and separation",async()=>{
  const jpeg="data:image/jpeg;base64,"+"A".repeat(400),webp="data:image/webp;base64,"+"B".repeat(100);
  const print={id:"p",title:"Frente",customerId:"c",customerName:"Ana",quantity:3,photoData:jpeg,separated:true,legacy:{preserve:true}};
  const fields=legacyPhotoFields({id:"o",photoData:jpeg,productionPhotoData:"",total:400,paid:120,referencePhotos:JSON.stringify([jpeg,"invalid-preserved"]),printsData:JSON.stringify([print])});
  const patch=await optimizePhotoFields(fields,async()=>webp);
  assert.deepEqual(Object.keys(patch).sort(),["photoData","printsData","referencePhotos"]);assert.equal(patch.photoData,webp);
  assert.deepEqual(JSON.parse(patch.referencePhotos),[webp,"invalid-preserved"]);assert.deepEqual(JSON.parse(patch.printsData),[{...print,photoData:webp}]);
  assert.deepEqual(await optimizePhotoFields({photoData:jpeg},async()=>jpeg+"AAAA"),{});
  assert.deepEqual(await optimizePhotoFields({photoData:jpeg},async()=>"data:image/png;base64,AA=="),{});
  assert.deepEqual(legacyPhotoFields({photoData:webp,productionPhotoData:""}),{});
  assert.deepEqual(await optimizePhotoFields({referencePhotos:"broken",printsData:"broken"},async()=>webp),{});
  assert.deepEqual(unchangedPhotoPatch({photoData:"",paid:300},{photoData:jpeg},{photoData:webp}),{});
  assert.deepEqual(unchangedPhotoPatch({photoData:"new user photo"},{photoData:jpeg},{photoData:webp}),{});
  assert.deepEqual(unchangedPhotoPatch({photoData:jpeg,paid:300},{photoData:jpeg},{photoData:webp}),{photoData:webp});
});

test("DTF accepts both new WebP and legacy JPEG without losing linked prints",()=>{
  const webp="data:image/webp;base64,AAAA",jpeg="data:image/jpeg;base64,AAAA";
  assert.deepEqual(dtfPhotos(packDtfPhotos([jpeg,webp])),[jpeg,webp]);
  const data=changeDtfPrints(undefined,{type:"add",print:{id:"p",title:"Frente",customerId:"c",customerName:"Ana",quantity:2,photoData:webp,separated:true}});
  assert.equal(readDtfPrints(data)[0].photoData,webp);assert.equal(readDtfPrints(data)[0].separated,true);
  assert.throws(()=>packDtfPhotos(["data:image/svg+xml;base64,AAAA"]));
});
