"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Bottom navigation, mobile-first.
 *
 * The centre slot is the log action and nothing else ever goes there. Logging a
 * meal is the one thing the product needs people to do repeatedly, so it gets a
 * permanent thumb-reachable target rather than living inside a restaurant page.
 */
const TABS = [
  { href: "/", label: "Feed", icon: HomeIcon },
  { href: "/discover", label: "Discover", icon: SearchIcon },
  { href: "/log", label: "Log", icon: PlusIcon, primary: true },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/me", label: "Me", icon: PersonIcon },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      <div className="mx-auto flex max-w-md items-end justify-around border-t bg-bg/92 px-2 pt-2 backdrop-blur-xl">
        {TABS.map(({ href, label, icon: Icon, ...rest }) => {
          const primary = "primary" in rest && rest.primary;
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          if (primary) {
            return (
              <Link
                key={href}
                href={href}
                aria-label="Log a visit"
                className="press -mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-bg shadow-lg shadow-accent/25"
              >
                <Icon className="h-6 w-6" />
              </Link>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`press flex w-16 flex-col items-center gap-1 rounded-lg py-1.5 ${
                active ? "text-text" : "text-faint"
              }`}
            >
              <Icon className="h-[22px] w-[22px]" />
              <span className="text-[10px] font-medium tracking-wide">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/* Line icons, drawn to a common 24px grid so they sit evenly together. */

type IconProps = { className?: string };
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MapIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke}>
      <path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.2 5.5-2.2V4L15 6.2Z" />
      <path d="M9 4v13.3M15 6.2V19.5" />
    </svg>
  );
}

function PersonIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke}>
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
    </svg>
  );
}
