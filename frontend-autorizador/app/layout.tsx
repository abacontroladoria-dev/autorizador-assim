import "./globals.css";
import { Toaster } from "react-hot-toast";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>
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