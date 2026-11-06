import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { Order, OrderStatus } from "./order-model";

type Gesture = {
  order: Order;
  handle: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
};

function edgeScroll(position: number, start: number, end: number) {
  const edge = 44;
  if (position < start + edge) return -Math.min(12, (start + edge - position) / 3);
  if (position > end - edge) return Math.min(12, (position - end + edge) / 3);
  return 0;
}

export default function useProductionDrag(board: RefObject<HTMLDivElement | null>, onDrop: (orderId: string, stage: OrderStatus) => void) {
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const preview = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState<{ order: Order; stage?: OrderStatus } | null>(null);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function stageAt(x: number, y: number) {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-production-drop]");
    if (target && board.current?.parentElement?.contains(target)) return target.dataset.productionDrop as OrderStatus;
  }

  function clearGesture() {
    if (gesture.current?.active) setDragged(null);
    gesture.current = null;
    cancelAnimationFrame(frame.current);
  }

  function updatePreview() {
    const current = gesture.current;
    if (!current?.active) return;
    if (!current.handle.isConnected) {
      clearGesture();
      return;
    }
    const { x, y } = current;
    const bounds = board.current?.getBoundingClientRect();
    if (bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
      const horizontal = edgeScroll(x, bounds.left, bounds.right);
      if (horizontal) board.current?.scrollBy({ left: horizontal });
    }
    if (y >= 0 && y <= window.innerHeight) {
      const vertical = edgeScroll(y, 0, window.innerHeight);
      if (vertical) window.scrollBy({ top: vertical });
    }
    if (preview.current) {
      const left = Math.min(x + 12, Math.max(8, window.innerWidth - preview.current.offsetWidth - 8));
      const top = Math.max(8, y - preview.current.offsetHeight - 9);
      preview.current.style.transform = `translate(${left}px, ${top}px)`;
    }
    const target = stageAt(x, y);
    const stage = target === current.order.status ? undefined : target;
    setDragged(previous => previous?.stage === stage ? previous : { order: current.order, stage });
    frame.current = requestAnimationFrame(updatePreview);
  }

  function start(event: PointerEvent<HTMLElement>, order: Order) {
    if (!event.isPrimary || event.button !== 0 || gesture.current?.handle.isConnected) return;
    if (gesture.current) clearGesture();
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const { pointerId, clientX: x, clientY: y } = event;
    gesture.current = { order, handle, pointerId, startX: x, startY: y, x, y, active: false };
  }

  function move(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.x = event.clientX;
    current.y = event.clientY;
    if (current.active || Math.hypot(current.x - current.startX, current.y - current.startY) < 6) return;
    current.active = true;
    setDragged({ order: current.order });
    frame.current = requestAnimationFrame(updatePreview);
  }

  function end(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    clearGesture();
    if (!current.active) return;
    const stage = event.type === "pointerup" ? stageAt(event.clientX, event.clientY) : undefined;
    if (stage && stage !== current.order.status) onDrop(current.order.id, stage);
  }

  return { dragged, preview, start, move, end };
}
