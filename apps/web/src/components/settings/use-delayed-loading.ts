import { useEffect, useState } from "react";

/** True once `loading` has lasted `delay` ms, so fast loads never flash a loading state. */
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
