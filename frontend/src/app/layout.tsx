import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Navbar } from '@/components/layout/navbar'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'StudyConnect — 学习资料共享平台',
    template: '%s | StudyConnect',
  },
  description: '优质学习资料共享，支持搜索、筛选、评分与下载',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={inter.variable} suppressHydrationWarning>
      <body>
        <Providers>
          <Navbar />
          <main className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-7xl px-4 py-6 sm:px-6">
            {children}
          </main>
          <footer className="border-t py-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} StudyConnect · 学习资料共享平台
          </footer>
        </Providers>
      </body>
    </html>
  )
}
