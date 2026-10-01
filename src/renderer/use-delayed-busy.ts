import { useEffect, useState } from "react";

/** Announce sustained work, without flashing a loading label between replies. */
export function useDelayedBusy(busy: boolean, key: string, delay = 300) {
  const [announced, setAnnounced] = useState<string>();
  useEffect(() => {
    setAnnounced(undefined);
    if (!busy) return;
    const timer = setTimeout(() => setAnnounced(key), delay);
    return () => clearTimeout(timer);
  }, [busy, key, delay]);
  return busy && announced === key;
}
