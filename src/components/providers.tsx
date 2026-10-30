"use client";

import type { ReactNode } from "react";
import { LocaleProvider } from "@/components/locale-provider";
import { PwaRegister } from "@/components/pwa-register";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <PwaRegister />
      {children}
    </LocaleProvider>
  );
}
