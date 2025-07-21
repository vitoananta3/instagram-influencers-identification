import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import Navigation from "./components/Navigation";
import { JobProvider } from "./contexts/JobContext";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Instagram Influencers Identification",
  description: "Real-time machine learning content analysis and engagement scoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geist.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <div className="min-h-screen">
          <header className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-6">
                <div className="flex items-center">
                  <div className="ml-4">
                    <h1 className="text-2xl font-bold text-gray-900">Instagram Influencers Identification</h1>
                    <p className="text-sm text-gray-500">Real-time content analysis and engagement scoring</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-500">
                    Need help? <Link href="mailto:vitoananta3@gmail.com" className="underline">@vitoananta3</Link>
                  </div>
                </div>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <JobProvider>
              <Navigation />
              {children}
            </JobProvider>
          </main>
        </div>
      </body>
    </html>
  );
}
