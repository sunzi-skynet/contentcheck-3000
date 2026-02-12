import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ComparisonProvider } from '@/context/ComparisonContext';

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
  title: 'Migration Checker',
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
          <div className="min-h-screen flex flex-col">
            <header className="border-b border-gray-200 bg-white">
              <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
                <a href="/" className="text-lg font-bold text-gray-900 hover:text-blue-600 transition">
                  Migration Checker
                </a>
                <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                  MVP
                </span>
              </div>
            </header>
            <main className="flex-1">{children}</main>
            <footer className="border-t border-gray-200 bg-white">
              <div className="max-w-5xl mx-auto px-4 py-4 text-center text-xs text-gray-400">
                Migration Checker &mdash; Compare pages during website migrations
              </div>
            </footer>
          </div>
        </ComparisonProvider>
      </body>
    </html>
  );
}
