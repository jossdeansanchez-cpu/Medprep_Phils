import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import DeviceCookie from "@/components/DeviceCookie";
import ServiceWorker from "@/components/ServiceWorker";
import InstallPrompt from "@/components/InstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MEDprep — PLE & NMAT Exam Practice",
  description:
    "Practice for the Philippine Physician Licensure Examination and the National Medical Admission Test with timed mock exams and daily practice sets.",
  // iOS ignores the manifest's icons/theme, so it needs these explicitly.
  appleWebApp: {
    capable: true,
    title: "MEDprep",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  other: {
    // Next.js emits only the standardized `mobile-web-app-capable`, but iOS
    // Safari still needs the legacy Apple-prefixed tag to launch full-screen
    // from the home screen. Harmless duplication; keeps older iOS working.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d7a5f",
  // Let content extend under the notch/home indicator; AppShell adds the
  // matching safe-area padding so nothing is actually obscured.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DeviceCookie />
        <ServiceWorker />
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
