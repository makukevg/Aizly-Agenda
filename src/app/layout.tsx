import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script' // 1. Importamos el componente Script
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Aizly — Agenda',
  description: 'Software de agenda para clínicas y consultorios',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* 2. Reemplazamos la etiqueta <script> por <Script> de next/script */}
        <Script
          id="theme-switcher"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.classList.toggle('dark', localStorage.theme==='dark')}catch(_){}`
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}