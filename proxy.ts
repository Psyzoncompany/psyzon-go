import { NextResponse, type NextRequest } from "next/server";

function contentSecurityPolicy(nonce: string) {
  const developmentScriptFallback = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  const upgradeInsecureRequests = process.env.NODE_ENV === "production" ? "; upgrade-insecure-requests" : "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() ?? "";
  const firebaseAuthOrigin = /^[a-z0-9.-]+$/i.test(authDomain) ? ` https://${authDomain}` : "";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/${developmentScriptFallback}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // Pluggy Connect injects a generated <style> element for its modal shell.
    // Keep script execution nonce-protected while allowing only inline CSS elements.
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://lh3.googleusercontent.com",
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebaseappcheck.googleapis.com https://www.googleapis.com https://accounts.google.com",
    `frame-src 'self' https://accounts.google.com${firebaseAuthOrigin} https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://connect.pluggy.ai`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
  ].join("; ") + upgradeInsecureRequests;
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
