"use client";
import { useEffect, useRef, useState } from "react";
import type { Order } from "./order-model";
import { shirtTotal, suggestedShirtPrice, poloExtra } from "./order-pricing";
import "./order-pricing.css";
export default function OrderPricingFields({ order }: { order?: Order }) {
  const field = useRef<HTMLFieldSetElement>(null);
  const typeEdited = useRef(false);
  const [shirtType, setShirtType] = useState(
    order?.shirtType ||
      (poloExtra(undefined, order?.product) ? "polo" : "standard"),
  );
  useEffect(() => {
    const form = field.current?.closest("form");
    const detect = (event: Event) => {
      if (
        !typeEdited.current &&
        event.target instanceof HTMLInputElement &&
        event.target.name === "product"
      )
        setShirtType(
          poloExtra(undefined, event.target.value) ? "polo" : "standard",
        );
    };
    form?.addEventListener("input", detect);
    return () => form?.removeEventListener("input", detect);
  }, []);
  const [quantity, setQuantity] = useState(String(order?.quantity || 1));
  const [children, setChildren] = useState(String(order?.childQuantity || 0));
  const [automatic, setAutomatic] = useState(
    !order || order.pricingMode === "quantity",
  );
  const [manualPrice, setPrice] = useState(
    order?.unitPrice === undefined ? "" : String(order.unitPrice),
  );
  const price = automatic
    ? String(suggestedShirtPrice(Number(quantity)))
    : manualPrice;
  const [manualTotal, setManualTotal] = useState(String(order?.total ?? 0));
  const total =
    price === ""
      ? Number(manualTotal)
      : shirtTotal(
          Number(price) + poloExtra(shirtType),
          Number(quantity),
          Number(children),
        );
  return (
    <fieldset ref={field} className="order-pricing-fields">
      <label>
        Tipo da camisa
        <select
          aria-label="Tipo da camisa"
          name="shirtType"
          value={shirtType}
          onChange={(e) => {
            typeEdited.current = true;
            setShirtType(e.target.value as "standard" | "polo");
          }}
        >
          <option value="standard">Camisa</option>
          <option value="polo">Gola polo · + R$ 15</option>
        </select>
      </label>
      <input
        type="hidden"
        name="pricingMode"
        value={automatic ? "quantity" : "manual"}
      />
      <label className="order-pricing-mode">
        <input
          type="checkbox"
          checked={automatic}
          onChange={(e) => {
            setPrice(price);
            setAutomatic(e.target.checked);
          }}
        />
        Preço automático por quantidade
      </label>
      <label>
        Quantidade
        <input
          name="quantity"
          type="number"
          min="1"
          max="1000000"
          required
          readOnly={order?.checklistQuantity !== undefined}
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            if (Number(children) > Number(e.target.value))
              setChildren(e.target.value);
          }}
        />
      </label>
      <label>
        Preço base por camisa adulta
        <input
          name="unitPrice"
          aria-label="Preço por camisa adulta"
          type="number"
          min="0"
          max="100000000"
          step="0.01"
          required={!order || order.unitPrice !== undefined}
          value={price}
          onChange={(e) => {
            setAutomatic(false);
            setPrice(e.target.value);
          }}
        />
      </label>
      <label>
        Quantidade infantil
        <input
          name="childQuantity"
          type="number"
          min="0"
          max={quantity}
          step="1"
          required
          readOnly={order?.checklistQuantity !== undefined}
          value={children}
          onChange={(e) => setChildren(e.target.value)}
        />
      </label>
      <label>
        Valor total
        <input
          name="total"
          type="number"
          min="0"
          max="100000000"
          step="0.01"
          value={Number.isFinite(total) ? total : 0}
          readOnly={price !== ""}
          onChange={(e) => setManualTotal(e.target.value)}
        />
      </label>
      <small>
        Infantil:{" "}
        {price === ""
          ? "informe o preço por camisa"
          : new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(
              Math.max(0, Number(price) + poloExtra(shirtType) - 5),
            )}{" "}
        por peça
      </small>
    </fieldset>
  );
}
