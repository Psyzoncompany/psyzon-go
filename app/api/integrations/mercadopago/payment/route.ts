import { authenticateFirebaseRequest, listUserCollection } from "../../../../lib/server/firebase-rest";
import {
  enforceMercadoPagoRateLimit,
  hasMercadoPagoAuthorizationConfiguration,
  isAuthorizedMercadoPagoIdentity,
} from "../../../../lib/server/financial-security";
import {
  createMercadoPagoPaymentHandler,
  mercadoPagoMethodNotAllowed,
} from "../../../../lib/server/mercado-pago-payment-handler";
import {
  findMercadoPagoPayment,
  mercadoPagoImportPreview,
  upsertMercadoPagoPayment,
} from "../../../../lib/server/mercado-pago";

export const runtime = "nodejs";

export const POST = createMercadoPagoPaymentHandler({
  authenticate: authenticateFirebaseRequest,
  authorize: isAuthorizedMercadoPagoIdentity,
  authorizationConfigured: hasMercadoPagoAuthorizationConfiguration,
  rateLimit: enforceMercadoPagoRateLimit,
  findPayment: findMercadoPagoPayment,
  previewPayment: mercadoPagoImportPreview,
  upsertPayment: upsertMercadoPagoPayment,
  listTransactions: (identity) => listUserCollection(identity, "transactions", 500),
});

export const GET = mercadoPagoMethodNotAllowed;
export const PUT = mercadoPagoMethodNotAllowed;
export const PATCH = mercadoPagoMethodNotAllowed;
export const DELETE = mercadoPagoMethodNotAllowed;
export const OPTIONS = mercadoPagoMethodNotAllowed;
