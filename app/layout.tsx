import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "PSYZON HUB · Sua empresa sob controle",
    description: "Controle financeiro e produtivo simples para a PSYZON Company.",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
    applicationName: "PSYZON HUB",
    openGraph: { title: "PSYZON HUB", description: "Produção + Financeiro em tempo real", images: [{ url: image, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title: "PSYZON HUB", description: "Sua empresa sob controle.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={geist.variable}>{children}</body></html>;
}
