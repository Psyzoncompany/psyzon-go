"use client";

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import useMoneyFit from "./useMoneyFit";
import "./money-layout.css";
import MoneyText from "./MoneyText";
import { contentAnimationMs } from "./animation-timing";

const whole = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const duration = contentAnimationMs;

function useTween(value: number, draw: (element: HTMLSpanElement, frame: number) => void) {
  const element = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  const renderFrame = useRef(draw);
  useLayoutEffect(() => { renderFrame.current = draw; });
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const screen = window.matchMedia("screen and (prefers-reduced-motion: no-preference)");
    const enabled = () => screen.matches && document.documentElement.dataset.glassMotion === "full";
    const from = current.current;
    if (from === value || !enabled() || !("IntersectionObserver" in window)) {
      current.current = value;
      return;
    }
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      current.current = value;
      delete node.dataset.tweening;
    };
    renderFrame.current(node, from);
    node.dataset.tweening = "";
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      const start = performance.now();
      function tick(now: number) {
        const elapsed = Math.max(0, Math.min(1, (now - start) / duration));
        if (elapsed >= 1 || !enabled()) { finish(); return; }
        current.current = from + (value - from) * (1 - (1 - elapsed) ** 3);
        renderFrame.current(node!, current.current);
        frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    });
    observer.observe(node);
    screen.addEventListener("change", finish);
    window.addEventListener("beforeprint", finish);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      screen.removeEventListener("change", finish);
      window.removeEventListener("beforeprint", finish);
      delete node.dataset.tweening;
    };
  }, [value]);
  return element;
}

type CounterProps = { value: number; format?: (value: number) => string };

export function CountUp({ value, format = whole.format }: CounterProps) {
  const label = format(value);
  // A privacy mask never mounts the numeric animation or exposes a previous frame.
  if (!Number.isFinite(value) || !/\d/.test(label)) return label.includes("R$")?<MoneyText>{label}</MoneyText>:<>{label}</>;
  return <VisibleCount value={value} label={label} format={format} />;
}

function VisibleCount({ value, label, format }: Required<CounterProps> & { label: string }) {
  const ref = useTween(value, (node, frame) => { node.lastElementChild?.setAttribute("data-frame", format(frame)); });
  useMoneyFit(ref,label);
  return <span ref={ref} className="motion-number" data-money={label.includes("R$")?"true":undefined} data-money-long={label.includes("R$")&&label.replace(/\D/g,"").length>=9}><span>{label}</span><i aria-hidden="true" /></span>;
}

export function ProgressBar({ value, label, color }: { value: number; label: string; color?: string }) {
  const percent = Math.max(0, Math.min(100, value));
  const ref = useTween(percent, (node, frame) => node.style.setProperty("--frame-fill", String(frame / 100)));
  return <span ref={ref} role="progressbar" className="motion-track" aria-label={label}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    style={{ "--target-fill": percent / 100, "--fill-color": color } as CSSProperties}><i /></span>;
}
