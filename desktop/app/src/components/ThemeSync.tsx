"use client";

import { useEffect } from "react";
import { syncThemeOnLoad } from "@/lib/theme";

/** Re-applies the saved theme once the app has loaded (also updates the Windows title bar). */
export function ThemeSync() {
  useEffect(() => { syncThemeOnLoad(); }, []);
  return null;
}
