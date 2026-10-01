"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { LogOut, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarCollapsibleItem,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAVIGATION, type NavLink } from "@/lib/navigation";
import { useSession } from "@/lib/session";

import { SidebarSearchTrigger } from "./command-palette";
import { LogoPlaceholder } from "./logo-placeholder";

function SidebarBrand() {
  const { open } = useSidebar();
  return open ? <LogoPlaceholder size="sm" /> : null;
}

function SidebarSignOut({ onSignOut }: { onSignOut: () => void }) {
  const { open } = useSidebar();
  return open ? (
    <Button variant="outline" onClick={onSignOut} className="w-full">
      <LogOut className="size-4" />
      Sign out
    </Button>
  ) : (
    <Button
      variant="outline"
      size="icon"
      onClick={onSignOut}
      aria-label="Sign out"
      title="Sign out"
    >
      <LogOut className="size-4" />
    </Button>
  );
}

function isActive(pathname: string, link: Pick<NavLink, "href" | "exact">) {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

/** Ralli Wolf sidebar structure, fed by the role-filtered HIMS navigation. */
export function AppSidebar({
  onRequestClose,
}: {
  onRequestClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { canAccess, signOut } = useSession();
  const [isClient, setIsClient] = React.useState(false);
  React.useEffect(() => setIsClient(true), []);

  return (
    <Sidebar className="h-full">
      <SidebarHeader>
        <SidebarBrand />
        <div className="hidden lg:block">
          <SidebarTrigger />
        </div>
        <button
          type="button"
          onClick={onRequestClose}
          aria-label="Close navigation"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/25 lg:hidden"
        >
          <X className="size-5" />
        </button>
      </SidebarHeader>

      <SidebarSearchTrigger />

      <SidebarContent className="scrollbar-none overscroll-contain">
        {NAVIGATION.map((group, index) => {
          const items = group.items.filter(item => canAccess(item.module));
          if (!items.length) return null;
          return (
            <SidebarGroup key={group.title ?? index} title={group.title}>
              {items.map(item =>
                item.children ? (
                  <SidebarCollapsibleItem
                    key={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={isClient && isActive(pathname, item)}
                    defaultOpen={isClient && isActive(pathname, item)}
                  >
                    {item.children.map(child => (
                      <SidebarItem
                        key={child.href}
                        label={child.label}
                        href={child.href}
                        icon={child.icon}
                        active={isClient && isActive(pathname, child)}
                      />
                    ))}
                  </SidebarCollapsibleItem>
                ) : (
                  <SidebarItem
                    key={item.href}
                    icon={item.icon}
                    label={item.label}
                    href={item.href}
                    active={isClient && isActive(pathname, item)}
                  />
                )
              )}
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSignOut
          onSignOut={() => {
            signOut();
            router.push("/login");
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}
