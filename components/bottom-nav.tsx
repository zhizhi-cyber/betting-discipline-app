"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plus, List } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const items = [
    { href: "/",       label: "首页", icon: Home },
    { href: "/review", label: "审查", icon: Plus, primary: true },
    { href: "/records", label: "记录", icon: List },
  ];

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-background/95 backdrop-blur-md border-t border-border z-50">
      <div className="flex">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const isActive = pathname === href ||
            (href === "/records" && (pathname.startsWith("/records") || pathname.startsWith("/abandoned")));
          return (
            <Link key={href} href={href}
              className={`flex-1 flex flex-col items-center justify-end pb-3 pt-2 gap-1 transition-colors ${
                primary ? "text-foreground"
                : isActive ? "text-foreground"
                : "text-muted-foreground"
              }`}
            >
              {primary ? (
                <div className="bg-foreground text-background rounded-full p-2.5 -mt-5 mb-0.5 shadow-lg shadow-black/30">
                  <Icon size={18} strokeWidth={2.5} />
                </div>
              ) : (
                <Icon size={19} strokeWidth={isActive ? 2.5 : 1.5} />
              )}
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
      <div style={{ height: "env(safe-area-inset-bottom)" }} />
    </div>
  );
}
