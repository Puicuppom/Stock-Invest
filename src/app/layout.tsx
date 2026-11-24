import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../../public/design-system.css";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InvestPui.com",
  description: "วิเคราะห์แนวรับแนวต้านหุ้น SET และ US",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", apple: "/icon-180.png" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "InvestPui",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#15111f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased ui2`}>
        {children}
        <RegisterSW />
        <Script src="/ptr.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
