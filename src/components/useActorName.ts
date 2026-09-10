"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "kn_actor_name";

/** Since there's no login (removed for now — see project README), manual
 *  edits still need *some* name for the adjustments audit trail (spec §6
 *  `adjustments.actor`). This just remembers whatever the person typed in
 *  their own browser, per-device — not real authentication. */
export function useActorName(): [string, (name: string) => void] {
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      setName(localStorage.getItem(STORAGE_KEY) ?? "");
    } catch {
      // localStorage unavailable — keep the empty default
    }
  }, []);

  function update(next: string) {
    setName(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — nothing to persist to
    }
  }

  return [name, update];
}
