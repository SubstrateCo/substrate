import { useEffect, useState } from "react";

export function useDelayedLoading(loading: boolean, delay = 250) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setShown(true), delay);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [loading, delay]);
  return loading && shown;
}
