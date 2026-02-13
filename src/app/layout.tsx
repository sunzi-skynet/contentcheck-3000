import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ComparisonProvider } from '@/context/ComparisonContext';
import { HeaderProvider } from '@/context/HeaderContext';
import AppHeader from '@/components/AppHeader';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'ContentCheck 3000',
  description:
    'Compare source and target pages during website migrations. See text diffs and image presence reports.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ComparisonProvider>
          <HeaderProvider>
            <div className="min-h-screen flex flex-col">
              <AppHeader />
              <main className="flex-1 flex flex-col">{children}</main>
              <footer className="border-t border-white/10 bg-black">
                <div className="max-w-5xl mx-auto px-4 py-4 text-center text-xs text-white/30">
                  ContentCheck 3000 &mdash; Compare pages during website migrations
                </div>
              </footer>
            </div>
          </HeaderProvider>
        </ComparisonProvider>
      </body>
    </html>
  );
}
