import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hot Potato',
  description: 'Scalp trading bot — catch the momentum',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-potato-bg text-potato-text min-h-screen">
        {children}
      </body>
    </html>
  )
}
