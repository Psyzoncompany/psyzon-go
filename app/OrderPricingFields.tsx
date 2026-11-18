"use client";
import { useEffect, useRef, useState } from "react";
import type { Order, ShirtType } from "./order-model";
import { shirtOrderPrice, suggestedShirtPrice, poloExtra, poloPieces, poloSurcharge } from "./order-pricing";
import "./order-pricing.css";
export default function OrderPricingFields({ order }: { order?: Order }) {
  const field = useRef<HTMLFieldSetElement>(null);
  const typeEdited = useRef(Boolean(order?.shirtType));
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
  const [poloQuantity, setPoloQuantity] = useState(order?.shirtType === "mixed" ? String(poloPieces(order)) : "");
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
  const [childPrice, setChildPrice] = useState(order?.childUnitPrice == null ? "" : String(order.childUnitPrice));
  const [manualTotal, setManualTotal] = useState(String(order?.total ?? 0));
  const mixed = shirtType === "mixed";
  const pricing = shirtOrderPrice({ unitPrice: Number(price), quantity: Number(quantity), childQuantity: Number(children), childUnitPrice: childPrice === "" ? null : Number(childPrice), shirtType, poloQuantity: Number(poloQuantity) });
  const total = price === "" ? Number(manualTotal) : pricing.total;
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
            const type = e.target.value as ShirtType;
            setShirtType(type);
            if (type !== "standard" && price === "") setAutomatic(true);
          }}
        >
          <option value="standard">Gola comum</option>
          <option value="polo">Gola polo · + R$ 15</option>
          <option value="mixed">Misto · gola comum e polo</option>
        </select>
      </label>
      {mixed && <label>
        Peças com gola polo
        <input name="poloQuantity" type="number" inputMode="numeric" min="0" max={quantity} step="1" required value={poloQuantity} onChange={event => setPoloQuantity(event.target.value)} />
        <small>
          {poloQuantity !== "" && Number(quantity) >= Number(poloQuantity) && `${Number(quantity) - Number(poloQuantity)} com gola comum · `}
          + R$ {poloSurcharge} por polo
        </small>
      </label>}
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
            if (Number(poloQuantity) > Number(e.target.value))
              setPoloQuantity(e.target.value);
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
          required={!order || order.unitPrice !== undefined || mixed}
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
      <label>{mixed ? "Preço base por camisa infantil" : "Preço por camisa infantil"}<input name="childUnitPrice" type="number" min="0" max="100000000" step="0.01" disabled={price === ""} value={childPrice} placeholder={price === "" ? "" : String(pricing.child)} onChange={event => setChildPrice(event.target.value)} /></label>
    </fieldset>
  );
}
