"use client";

import { useEffect, useState } from "react";
import { clickUpBridge, type ClickUpSnapshot } from "../lib/clickupDesktop";

/** Live ClickUp snapshot from the desktop app; null outside the desktop app or before it loads. */
export function useClickUpSnapshot() {
  const [snapshot, setSnapshot] = useState<ClickUpSnapshot | null>(null);
  useEffect(() => {
    const bridge = clickUpBridge();
    if (!bridge) return;
    let active = true;
    void bridge.getClickUpSnapshot().then((next) => { if (active) setSnapshot(next); }).catch(() => {});
    const unsubscribe = bridge.onClickUpUpdated((next) => { if (active) setSnapshot(next); });
    return () => { active = false; unsubscribe(); };
  }, []);
  return snapshot;
}
