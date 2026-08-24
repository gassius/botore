import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'botore ops',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          background: '#0b0f14',
          color: '#e6edf3',
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
        }}
      >
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 24 }}>
          <header style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 20 }}>botore operations (local)</h1>
            <span style={{ color: '#f0b429', fontSize: 12, alignSelf: 'center' }}>
              DEVELOPMENT-ONLY
            </span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
