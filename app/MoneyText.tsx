"use client";
import { useRef } from "react";
import useMoneyFit from "./useMoneyFit";
import "./money-layout.css";
export default function MoneyText({children}:{children:string}) {
  const ref=useRef<HTMLSpanElement>(null);useMoneyFit(ref,children);
  return <span ref={ref} className="money-fit" data-money="true" data-money-long={children.replace(/\D/g,"").length>=9}><span>{children}</span></span>;
}
