import type { Metadata } from "next";
import { Toaster } from "@/components/rhizome/sonner";
import { AppShell } from "@/components/layout/AppShell";
import { ProcessingDock } from "@/components/layout/ProcessingDock";
import "./globals.css";

// Fonts are now loaded via CSS @import in neobrutalism.css
// Change fonts in: src/styles/neobrutalism.css (lines 44-45)

export const metadata: Metadata = {
  title: "Rhizome V2 - AI-Powered Document Processing & Knowledge Synthesis",
  description: "Transform documents into structured knowledge through clean markdown, semantic chunking, and 7-engine collision detection for discovering connections between ideas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased neobrutalism-theme">
        <AppShell>
          {children}
        </AppShell>
        <ProcessingDock />
        <Toaster />
      </body>
    </html>
  );
}
