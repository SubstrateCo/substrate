type VisibilityListener = (visible: boolean) => void;

const listeners = new Map<Element, VisibilityListener>();
let observer: IntersectionObserver | null = null;

function shared(): IntersectionObserver {
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) listeners.get(entry.target)?.(entry.isIntersecting);
  });
  return observer;
}

export function observeVisibility(element: Element, listener: VisibilityListener): () => void {
  listeners.set(element, listener);
  shared().observe(element);
  return () => {
    listeners.delete(element);
    observer?.unobserve(element);
  };
}
