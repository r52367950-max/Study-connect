import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { SiteShell } from '@/components/layout/site-shell'

export const metadata: Metadata = {
  title: {
    default: 'StudyConnect — 学习资料共享平台',
    template: '%s | StudyConnect',
  },
  description: '优质学习资料共享，支持搜索、筛选、评分与下载',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>
          <SiteShell>{children}</SiteShell>
        </Providers>
      </body>
    </html>
  )
}
