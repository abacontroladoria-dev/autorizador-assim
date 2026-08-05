import "./globals.css";
import { Toaster } from "react-hot-toast";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import type { Metadata, Viewport } from "next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Sistema Pulsar - Universo ABA",
  description: "Sistema Pulsar",

  manifest: "/manifest.json",

  icons: {
    icon: [
      { url: "/icon.png" },
    ],
    apple: "/icon-192.png",
  },

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pulsar",
  },
};

export const viewport: Viewport = {
  themeColor: '#3A8FB7',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={cn("font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}` }} />
      </head>
      <body>
        <ServiceWorkerRegistration />
        {children}

        {/* TOAST GLOBAL */}
        <Toaster
  position="top-center"
  toastOptions={{
    style: {
      borderRadius: '10px',
      background: '#3A8FB7',
      color: '#fff',
      fontSize: '14px',
    },
  }}
/>
      </body>
    </html>
  );
}
