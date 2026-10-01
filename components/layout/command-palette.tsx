"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";

import {
  HospitalIcon,
  IdCard,
  LogOut,
  Menu,
  Microscope,
  Phone,
  ReceiptText,
  Search,
  Stethoscope,
  UserSwitch,
  type IconComponent,
} from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useView } from "@/lib/api/client";
import { NAVIGATION } from "@/lib/navigation";
import { useSession } from "@/lib/session";
import type { RecordKind } from "@/lib/views/system";
import { cn } from "@/lib/utils";

const RECENT_STORAGE_KEY = "hims:command-palette:recent";
const RECENT_LIMIT = 5;

interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  section?: string;
  icon: IconComponent;
  keywords: string[];
  hint?: string;
  perform: () => void;
}

interface ResultSection {
  title: string;
  commands: PaletteCommand[];
  start: number;
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Recents are a convenience; carry on without them.
  }
}

function startsAtWordBoundary(text: string, token: string) {
  return text.split(/[^a-z0-9]+/).some(word => word.startsWith(token));
}

function isSubsequence(token: string, text: string) {
  let cursor = 0;
  for (const character of text) {
    if (character === token[cursor]) cursor += 1;
    if (cursor === token.length) return true;
  }
  return false;
}

function scoreToken(
  token: string,
  label: string,
  context: string,
  keywords: string[]
) {
  if (label === token) return 120;
  if (label.startsWith(token)) return 100;
  if (startsAtWordBoundary(label, token)) return 80;
  if (label.includes(token)) return 60;
  if (keywords.some(keyword => keyword.startsWith(token))) return 45;
  if (keywords.some(keyword => keyword.includes(token))) return 35;
  if (context.includes(token)) return 25;
  if (isSubsequence(token, label)) return 10;
  return 0;
}

function scoreCommand(command: PaletteCommand, tokens: string[]) {
  const label = command.label.toLowerCase();
  const context = `${command.section ?? ""} ${command.group}`.toLowerCase();
  const keywords = command.keywords.map(keyword => keyword.toLowerCase());
  let total = 0;
  for (const token of tokens) {
    const score = scoreToken(token, label, context, keywords);
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

const KIND_SECTION: Record<RecordKind, string> = {
  patient: "Patient",
  appointment: "Appointment",
  admission: "Admission",
  invoice: "Bill",
  enquiry: "Enquiry",
  lab: "Lab order",
};

const KIND_ICON: Record<RecordKind, IconComponent> = {
  patient: IdCard,
  appointment: Stethoscope,
  admission: HospitalIcon,
  invoice: ReceiptText,
  enquiry: Phone,
  lab: Microscope,
};

function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useShortcutLabel() {
  const [label, setLabel] = React.useState<string | null>(null);
  React.useEffect(() => {
    setLabel(
      /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "⌘K" : "Ctrl K"
    );
  }, []);
  return label;
}

const PaletteContext = React.createContext<{ open: () => void } | null>(null);

function useCommandPalette() {
  const value = React.useContext(PaletteContext);
  if (!value)
    throw new Error(
      "useCommandPalette must be used inside <CommandPaletteProvider>"
    );
  return value;
}

function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { canAccess, signOut } = useSession();
  const { open: sidebarOpen, toggle: toggleSidebar } = useSidebar();

  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [recent, setRecent] = React.useState<string[]>([]);
  const itemRefs = React.useRef(new Map<number, HTMLDivElement>());

  React.useEffect(() => {
    if (open) setRecent(readRecent());
  }, [open]);

  const go = React.useCallback(
    (href: string) => {
      router.push(href);
      onNavigate?.();
    },
    [router, onNavigate]
  );

  // Records (patients, visits, bills…) come from a role-checked search view.
  const search = useDebounced(query.trim(), 150);
  const { data: hits } = useView(
    "search.records",
    { query: search },
    { enabled: open && search.length >= 2, placeholderData: keepPreviousData }
  );
  const records = React.useMemo<PaletteCommand[]>(
    () =>
      query.trim().length < 2
        ? []
        : (hits ?? []).map(hit => ({
            id: hit.id,
            label: hit.label,
            group: "Records",
            section: KIND_SECTION[hit.kind],
            icon: KIND_ICON[hit.kind],
            keywords: [],
            hint: hit.hint,
            perform: () => go(hit.href),
          })),
    [hits, query, go]
  );

  const commands = React.useMemo<PaletteCommand[]>(() => {
    const pages: PaletteCommand[] = [];
    for (const group of NAVIGATION) {
      for (const item of group.items) {
        const links = item.children ?? [item];
        for (const link of links) {
          if (!canAccess(link.module)) continue;
          pages.push({
            id: `page:${link.href}`,
            label: link.label,
            group: "Pages",
            section: item.children ? item.label : group.title,
            icon: link.icon,
            keywords: link.keywords ?? [],
            perform: () => go(link.href),
          });
        }
      }
    }

    const actions: PaletteCommand[] = [
      {
        id: "action:toggle-sidebar",
        label: sidebarOpen ? "Collapse navigation" : "Expand navigation",
        group: "Actions",
        section: "Workspace",
        icon: Menu,
        keywords: ["sidebar", "menu"],
        perform: toggleSidebar,
      },
      {
        id: "action:switch-role",
        label: "Switch role",
        group: "Actions",
        section: "Session",
        icon: UserSwitch,
        keywords: ["login", "user", "doctor", "nurse"],
        perform: () => go("/login"),
      },
      {
        id: "action:logout",
        label: "Sign out",
        group: "Actions",
        section: "Session",
        icon: LogOut,
        keywords: ["log out", "exit"],
        perform: () => {
          signOut();
          go("/login");
        },
      },
    ];
    return [...pages, ...actions];
  }, [canAccess, go, sidebarOpen, toggleSidebar, signOut]);

  const sections = React.useMemo<ResultSection[]>(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const grouped: Array<{ title: string; commands: PaletteCommand[] }> = [];

    if (tokens.length === 0) {
      const recentCommands = recent
        .map(id => commands.find(command => command.id === id))
        .filter((command): command is PaletteCommand => Boolean(command))
        .slice(0, RECENT_LIMIT);
      if (recentCommands.length > 0)
        grouped.push({ title: "Recent", commands: recentCommands });
      for (const command of commands) {
        const existing = grouped.find(
          entry => entry.title === command.group && entry.title !== "Recent"
        );
        if (existing) existing.commands.push(command);
        else grouped.push({ title: command.group, commands: [command] });
      }
    } else {
      if (records.length) grouped.push({ title: "Records", commands: records });
      const ranked = commands
        .map((command, index) => ({
          command,
          index,
          score: scoreCommand(command, tokens),
        }))
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(entry => entry.command);
      if (ranked.length > 0)
        grouped.push({ title: "Pages & actions", commands: ranked });
    }

    let start = 0;
    return grouped.map(entry => {
      const section = { ...entry, start };
      start += entry.commands.length;
      return section;
    });
  }, [commands, query, recent, records]);

  const flatCommands = React.useMemo(
    () => sections.flatMap(section => section.commands),
    [sections]
  );

  React.useEffect(() => setActiveIndex(0), [query, open]);
  React.useEffect(() => {
    if (activeIndex > flatCommands.length - 1) setActiveIndex(0);
  }, [activeIndex, flatCommands.length]);
  React.useEffect(() => {
    itemRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, sections]);

  const runCommand = React.useCallback(
    (command: PaletteCommand) => {
      if (
        !command.id.includes(":") ||
        command.id.startsWith("page:") ||
        command.id.startsWith("action:")
      ) {
        const nextRecent = [
          command.id,
          ...readRecent().filter(id => id !== command.id),
        ].slice(0, RECENT_LIMIT);
        writeRecent(nextRecent);
        setRecent(nextRecent);
      }
      onOpenChange(false);
      command.perform();
    },
    [onOpenChange]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (flatCommands.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(current => (current + 1) % flatCommands.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        current => (current - 1 + flatCommands.length) % flatCommands.length
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(flatCommands.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = flatCommands[activeIndex];
      if (command) runCommand(command);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-label="Search"
        className="bottom-auto top-[12vh] max-w-xl"
      >
        <DialogTitle className="sr-only">Search the hospital</DialogTitle>
        <DialogDescription className="sr-only">
          Search patients by name, UHID or phone, reference numbers, pages and
          actions. Press Enter to open the highlighted result.
        </DialogDescription>

        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search patients, UHID, phone, APT/ADM/INV numbers, pages…"
            className="h-6 w-full border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-autocomplete="list"
            aria-activedescendant={
              flatCommands.length > 0
                ? `command-palette-option-${activeIndex}`
                : undefined
            }
          />
        </div>

        <div
          id="command-palette-list"
          role="listbox"
          aria-label="Results"
          className="max-h-[24rem] overflow-y-auto overscroll-contain p-1.5"
        >
          {flatCommands.length === 0 ? (
            <p className="px-2.5 py-8 text-center text-sm text-muted-foreground">
              No matches for “{query.trim()}”
            </p>
          ) : (
            sections.map(section => (
              <div key={section.title} className="pb-1 last:pb-0">
                <p className="px-2.5 pb-1 pt-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {section.title}
                </p>
                {section.commands.map((command, indexInSection) => {
                  const index = section.start + indexInSection;
                  const active = index === activeIndex;
                  const Icon = command.icon;
                  return (
                    <div
                      key={`${section.title}:${command.id}`}
                      id={`command-palette-option-${index}`}
                      ref={element => {
                        if (element) itemRefs.current.set(index, element);
                        else itemRefs.current.delete(index);
                      }}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      onMouseMove={() => setActiveIndex(index)}
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => runCommand(command)}
                      className={cn(
                        "flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[0.8125rem] text-foreground",
                        active && "bg-secondary"
                      )}
                    >
                      <Icon
                        size={16}
                        className="shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {command.label}
                      </span>
                      {(command.hint ?? command.section) && (
                        <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                          {command.hint ?? command.section}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
          <span>
            <kbd className="font-sans">↑</kbd>{" "}
            <kbd className="font-sans">↓</kbd> to navigate
          </span>
          <span>
            <kbd className="font-sans">↵</kbd> to open
          </span>
          <span>
            <kbd className="font-sans">esc</kbd> to close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Owns the palette and the global ⌘K / Ctrl+K shortcut; mount once. */
export function CommandPaletteProvider({
  children,
  onNavigate,
}: {
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(current => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = React.useMemo(() => ({ open: () => setOpen(true) }), []);

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        onNavigate={onNavigate}
      />
    </PaletteContext.Provider>
  );
}

/** The sidebar's search field, as in Ralli Wolf. */
export function SidebarSearchTrigger() {
  const { open: sidebarOpen } = useSidebar();
  const { open } = useCommandPalette();
  const shortcut = useShortcutLabel();
  const shared =
    "inline-flex h-9 items-center rounded-md border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/25";

  if (!sidebarOpen) {
    return (
      <div className="border-b border-sidebar-border px-2 py-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={open}
                aria-label="Search"
                aria-keyshortcuts="Meta+K Control+K"
                className={cn(shared, "w-full justify-center px-0")}
              >
                <Search size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              Search patients and pages
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="border-b border-sidebar-border px-3 py-3">
      <button
        type="button"
        onClick={open}
        aria-label="Search patients, UHID, phone, reference numbers or pages"
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(shared, "w-full gap-2 px-2.5 text-[0.8125rem]")}
      >
        <Search size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          Search patients…
        </span>
        {shortcut && (
          <kbd className="shrink-0 rounded border border-sidebar-border bg-sidebar px-1.5 py-0.5 font-sans text-[0.625rem] font-medium text-sidebar-foreground/60">
            {shortcut}
          </kbd>
        )}
      </button>
    </div>
  );
}
