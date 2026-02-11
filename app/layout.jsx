import './styles/globals.css';

export const metadata = {
  title: 'Neighborhood Boy',
  description: 'A hand-inked guide to the restaurants that still deliver themselves.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
