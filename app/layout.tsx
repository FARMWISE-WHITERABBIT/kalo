import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Toaster } from "@/components/ui/sonner";
import { CurrencyProvider } from "@/components/currency-provider";

export const metadata: Metadata = {
  title: "Kalo",
  description: "Play-money prediction markets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased dark" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">
        {/* apply the stored theme before first paint; dark is the default */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('kalo-theme')==='light')document.documentElement.classList.remove('dark')}catch(e){}",
          }}
        />
        <CurrencyProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster />
        </CurrencyProvider>
      </body>
    </html>
  );
}
