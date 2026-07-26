import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, Noto_Nastaliq_Urdu } from "next/font/google";
import "../globals.css";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const notoNastaliq = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic"],
});

export const metadata: Metadata = {
  title: "Nigheban — Multi-Hazard Early Warning Platform",
  description: "Provincial multi-hazard monitoring and alert system for KP & GB",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#01411C",
};

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const messages = await getMessages();
  const isUrdu = locale === 'ur';

  return (
    <html lang={locale} dir={isUrdu ? 'rtl' : 'ltr'}>
      <body
        className={`${inter.variable} ${plexMono.variable} ${notoNastaliq.variable} antialiased ${
          isUrdu ? 'font-[family-name:var(--font-urdu)]' : ''
        }`}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
