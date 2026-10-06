import type { Metadata } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import Header from "@/components/Header";
import { toPublicUser } from "@/lib/db";
import { currentUser } from "@/lib/session";

// Designed by the Braille Institute for readers with low vision.
const atkinson = Atkinson_Hyperlegible({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-atkinson" });

export const metadata: Metadata = {
  title: "Life Stories",
  description: "Record your life story with a friendly interviewer, and share it with the people who matter.",
};

// Restores the chosen text size before the first paint.
const textSizeScript = `(function(){try{var s=localStorage.getItem("textSize");if(s)document.documentElement.setAttribute("data-size",s)}catch(e){}})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await currentUser();
  return (
    <html lang="en" data-size="m" className={atkinson.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: textSizeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <Header user={user ? toPublicUser(user) : null} />
        <main className={`mx-auto w-full max-w-6xl px-4 pt-6 ${user ? "pb-40" : "pb-16"}`}>{children}</main>
        {user && <BottomNav />}
      </body>
    </html>
  );
}
