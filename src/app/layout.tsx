import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "eKasiBooks Portal",
  description: "Secure access for authentication, billing, and account management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className={`${geistMono.variable} antialiased min-h-screen relative overflow-hidden`}>
        {/* Background image */}
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url(/portal-bg.jpg)" }}
        />

        {/* Soft fade overlay */}
        <div className="fixed inset-0 -z-10 bg-white/55" />

        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}