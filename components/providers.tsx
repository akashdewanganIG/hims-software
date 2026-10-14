"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "@/components/layout/app-shell";
import { ConfirmProvider } from "@/components/ui/confirm-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useServerSync } from "@/lib/api/client";
import { FreshHighlighter } from "@/lib/fresh";
import { SessionProvider } from "@/lib/session";

/** Keeps screens current with changes other people make (server mode). */
function ServerSync() {
  useServerSync();
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      })
  );

  return (
    <>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <SessionProvider>
            <ServerSync />
            <FreshHighlighter />
            <ConfirmProvider>
              <AppShell>{children}</AppShell>
            </ConfirmProvider>
          </SessionProvider>
        </TooltipProvider>
      </QueryClientProvider>
      <Toaster
        position="bottom-right"
        closeButton
        duration={5000}
        style={{ zIndex: 9999 }}
      />
    </>
  );
}
