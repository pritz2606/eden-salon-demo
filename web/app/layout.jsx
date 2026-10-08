import './globals.css';
import SiteChrome from '../components/site-chrome';

export const metadata = {
  title: { default: 'Eden Salon demo — A little time for you', template: '%s · Eden Salon demo' },
  description: 'An independent salon booking portfolio concept by Pritam Badagi. Explore the sample menu, find a slot, and try a complete appointment experience.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return <html lang="en"><body><SiteChrome>{children}</SiteChrome></body></html>;
}
