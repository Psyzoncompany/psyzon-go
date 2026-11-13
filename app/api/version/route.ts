import { NextResponse } from "next/server";
export const dynamic="force-static";
export function GET(){return NextResponse.json({version:process.env.NEXT_PUBLIC_PSYZON_BUILD??"development"},{headers:{"Cache-Control":"no-store, max-age=0"}});}
