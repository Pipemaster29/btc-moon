import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { AbasDoSite } from "@/components/Abas";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BTC Moon",
  description: "Análise de Bitcoin com APIs públicas e indicadores matemáticos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* A barra fica no layout raiz para valer em toda aba, a página de cada
            moeda inclusive. No celular a marca sai: com ela, a quinta aba ficava
            escondida atrás da rolagem de lado em 390 px; sem ela, as cinco cabem. */}
        <header className="sticky top-0 z-30 border-b border-black/10 dark:border-white/10 bg-zinc-50/90 dark:bg-black/90 backdrop-blur font-sans">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-2 sm:gap-6">
            <Link href="/" className="hidden sm:block shrink-0 text-sm font-bold tracking-tight">
              BTC Moon
            </Link>
            <AbasDoSite />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
