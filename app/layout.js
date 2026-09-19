import "./globals.css";
import "@phosphor-icons/web/regular";

export const metadata = {
  title: "Trekkster — a travel journal that keeps its own map",
  description: "Write a page for every day of a trip, break out the days worth their own story, and watch the pins fill in."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
