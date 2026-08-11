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
    title: "PSYZON GO · Sua empresa sob controle",
    description: "Controle financeiro e produtivo simples para a PSYZON Company.",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon-192-v3.png?v=4", sizes: "192x192", type: "image/png" },
        { url: "/icon-512-v3.png", sizes: "512x512", type: "image/png" },
      ],
      shortcut: { url: "/icon-192-v3.png?v=4", type: "image/png" },
      apple: { url: "/icon-192-v3.png", sizes: "192x192", type: "image/png" },
    },
    applicationName: "PSYZON GO",
    openGraph: { title: "PSYZON GO", description: "Produção + Financeiro em tempo real", images: [{ url: image, width: 1536, height: 1024 }] },
    twitter: { card: "summary_large_image", title: "PSYZON GO", description: "Sua empresa sob controle.", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className={geist.variable}>{children}</body></html>;
}
