import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import BackgroundOrbs from "@/components/background-orbs";
import ServiceWorkerRegister from "@/components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "大赢家",
  description: "足球亚盘让球纪律审查工具",
  manifest: "/betting-discipline-app/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "大赢家",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <ServiceWorkerRegister />
          <BackgroundOrbs />
          <div className="max-w-[430px] mx-auto min-h-screen relative z-10">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
