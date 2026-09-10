import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบคำนวณค่าคอมมิชชั่นการตลาด (KN)",
  description: "หจก.สามทองบริการ / เค.ซี.คอร์ปอเรชั่น",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
