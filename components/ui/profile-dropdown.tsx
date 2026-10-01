"use client";

import { LogOut, User, UserSwitch } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MENU_ITEM_DESTRUCTIVE } from "@/components/ui/form-control";
import { roleTone } from "@/components/ui/status-badge";
import { Tag } from "@/components/ui/tag";
import { initials } from "@/lib/format";

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  roleLabel?: string;
  /** Photo as a data URL; initials are shown without one. */
  photo?: string;
}

/**
 * Ralli Wolf's account menu, with the simulation's actions: switching role
 * replaces profile/password management, which a simulation does not need.
 */
export function ProfileDropdown({
  user,
  onOpenProfile,
  onSwitchRole,
  onLogout,
}: {
  user: UserProfile;
  onOpenProfile?: () => void;
  onSwitchRole?: () => void;
  onLogout?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface outline-none transition-[background-color,border-color] duration-150 hover:border-border-strong hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label={`Open account menu for ${user.name}`}
        >
          {user.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- stored data URL
            <img
              src={user.photo}
              alt=""
              className="size-7 rounded-sm object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-sm bg-primary text-[0.6875rem] font-semibold text-primary-foreground"
            >
              {initials(user.name)}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[min(15rem,calc(100vw-2rem))] p-1"
        align="end"
        sideOffset={6}
      >
        <div className="px-2 py-1.5">
          <p className="truncate text-[0.8125rem] font-semibold leading-5 text-foreground">
            {user.name}
          </p>
          <p
            className="truncate text-xs leading-4 text-muted-foreground"
            title={user.email}
          >
            {user.email}
          </p>
          <Tag tone={roleTone(user.role)} className="mt-1">
            {user.roleLabel ?? user.role}
          </Tag>
        </div>

        {onOpenProfile || onSwitchRole ? <DropdownMenuSeparator /> : null}
        {onOpenProfile && (
          <DropdownMenuItem onClick={onOpenProfile}>
            <User aria-hidden="true" className="size-4" />
            <span>My staff record</span>
          </DropdownMenuItem>
        )}
        {onSwitchRole && (
          <DropdownMenuItem onClick={onSwitchRole}>
            <UserSwitch aria-hidden="true" className="size-4" />
            <span>Switch role</span>
          </DropdownMenuItem>
        )}

        {onLogout ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onLogout}
              className={MENU_ITEM_DESTRUCTIVE}
            >
              <LogOut aria-hidden="true" className="size-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
