"use client";

import { useRouter } from "next/navigation";

import { Menu } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ProfileDropdown } from "@/components/ui/profile-dropdown";
import { useStoredFile } from "@/lib/api/client";
import { staffName } from "@/lib/api/lookup";
import { HOSPITAL } from "@/lib/sim/reference";
import { useSession } from "@/lib/session";

import { SimulationMenu } from "./simulation-menu";

/** Same composition as the Ralli Wolf header: context left, controls right. */
export function AppHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const { staff, role, photoFileId, signOut, canAccess } = useSession();
  const { data: photo } = useStoredFile(photoFileId);
  if (!staff || !role) return null;

  return (
    <header className="no-print sticky top-0 z-40 w-full border-b border-border bg-surface/95 backdrop-blur">
      <div className="flex h-16 w-full items-center justify-between gap-3 bg-navbar px-4 sm:px-6 xl:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onMenuClick}
            aria-label="Open navigation"
            className="text-muted-foreground hover:text-foreground lg:hidden"
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground sm:text-base">
              {HOSPITAL.name}
            </p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {staff.designation} · signed in as {role.name}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SimulationMenu />
          <ProfileDropdown
            user={{
              name: staffName(staff),
              email: staff.email,
              role: role.id,
              roleLabel: role.name,
              photo: photo?.data,
            }}
            onOpenProfile={
              canAccess("wfm")
                ? () => router.push(`/wfm?open=${staff.id}`)
                : undefined
            }
            onSwitchRole={() => router.push("/login")}
            onLogout={() => {
              signOut();
              router.push("/login");
            }}
          />
        </div>
      </div>
    </header>
  );
}
