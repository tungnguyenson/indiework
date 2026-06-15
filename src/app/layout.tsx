import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Plus_Jakarta_Sans, Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import '@/styles/tokens.css';
import '@/styles/app.css';
import '@/styles/screens.css';
import { FONT_STACK, UI_FONT_DEFAULT, UI_FONT_STORAGE_KEY } from '@/lib/fonts';

// Default UI face — a neutral grotesque with a variable weight axis (so the
// wordmark's 800 and every UI weight render from one file). Preloaded as the
// app-wide default.
const hanken = Hanken_Grotesk({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-hanken',
  display: 'swap',
});

// Alternates offered in App Settings → Appearance. We skip preloading — only the
// active face is fetched on routes other than Settings. Be Vietnam Pro is a
// static family, so its weights are pinned (400/500/600/700, plus 800 for the
// wordmark); Plus Jakarta Sans exposes a variable axis, so one file covers it.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
  preload: false,
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  variable: '--font-plus-jakarta',
  display: 'swap',
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'IndieWork — calm project management for solo devs',
  description:
    'A single-user, self-hostable project manager for solo indie developers. Module ⟂ Milestone, Inbox capture, and a service layer behind Web, REST, and MCP.',
  metadataBase: new URL('https://indiework.space'),
};

// Applies the user's saved UI font before first paint, so a reload on any route
// (not just Settings) renders the chosen face with no flash of the default.
// Stored as a raw string under `iw-ui-font` (matches the picker + handoff).
const fontBootScript = `(function(){try{var m=${JSON.stringify(FONT_STACK)},v=localStorage.getItem(${JSON.stringify(
  UI_FONT_STORAGE_KEY,
)})||${JSON.stringify(UI_FONT_DEFAULT)};document.documentElement.style.setProperty('--font-ui',m[v]||m[${JSON.stringify(
  UI_FONT_DEFAULT,
)}]);}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const fontVars = `${beVietnamPro.variable} ${plusJakarta.variable} ${hanken.variable} ${plexMono.variable}`;
  // fontBootScript sets --font-ui on <html> before hydration, so the element's
  // style attribute legitimately differs from the server markup — suppress the
  // one-level hydration diff for <html> only.
  return (
    <html lang="en" className={fontVars} data-theme="light" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: fontBootScript }} />
        {children}
      </body>
    </html>
  );
}
