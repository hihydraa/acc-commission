import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-border bg-background">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
        <Link href="/periods" className="font-semibold">
          KN Commission
        </Link>
        <Link href="/periods" className="text-muted-foreground hover:text-foreground">
          ประวัติรอบ
        </Link>
        <Link href="/settings/customers" className="text-muted-foreground hover:text-foreground">
          ตั้งค่าลูกค้า/ระยะทาง
        </Link>
        <Link href="/settings/config" className="text-muted-foreground hover:text-foreground">
          ตั้งค่าระบบ
        </Link>
      </nav>
    </header>
  );
}
