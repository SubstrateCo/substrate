import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useInboxWorkspace } from "../inbox-workspace-context";
import { Button } from "@/components/ui/button";
import { mailHref } from "@/lib/mail/body-text";
import { newsletterLayout } from "@/lib/mail/newsletter-layout";
import { inlineRaster, readerBase, readerFit } from "@/lib/mail/newsletter-style";

export function Newsletter({ html, id }: { html: string; id: string }) {
  const { api, scope } = useInboxWorkspace();
  const { userId, organizationId } = scope;
  const layout = useMemo(() => newsletterLayout(html), [html]);
  const frame = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [allowed, setAllowed] = useState<typeof layout>();
  const [missing, setMissing] = useState(false);
  const show = allowed === layout;
  useLayoutEffect(() => {
    const element = frame.current;
    if (!doc || !element || doc.URL !== new URL("/mail-body.html", window.location.href).href)
      return;
    const style = doc.createElement("style");
    style.textContent = `${readerBase}\n${layout.css}\n${readerFit}`;
    doc.head.append(style);
    const root = doc.importNode(layout.root, true);
    doc.body.replaceChildren(root);
    doc.documentElement.toggleAttribute("data-mail-compact", layout.sources.length > 0);
    const lifetime = new AbortController();
    const stopped = () => lifetime.signal.aborted;
    const measure = () => {
      const height = `${Math.max(1, Math.ceil(root.getBoundingClientRect().height))}px`;
      if (element.style.height !== height) element.style.height = height;
    };
    // Resizing the frame can itself resize the document. Apply that write after observer delivery.
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (!stopped()) measure();
      });
    });
    observer.observe(root);
    measure();
    // The frame allows neither scripts nor popups. The app opens only a user-activated,
    // validated link using the same external-window handling as plain text messages.
    const openLink = (event: MouseEvent) => {
      const anchor = Array.from(root.querySelectorAll("a[href]")).find((a) =>
        event.composedPath().includes(a),
      );
      if (!anchor) return;
      event.preventDefault();
      const href = mailHref(anchor.getAttribute("href"));
      if (event.isTrusted && event.button <= 1 && href)
        window.open(href, "_blank", "noopener,noreferrer");
    };
    doc.addEventListener("click", openLink);
    doc.addEventListener("auxclick", openLink);
    // Keyboard users can still leave the reader while focus is in the isolated document.
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        element.focus();
        element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
    };
    doc.addEventListener("keydown", escape);
    if (show) {
      const queue = layout.sources.entries(),
        progress = { failed: 0, bytes: 0 };
      const load = async () => {
        for (const [i, source] of queue) {
          if (stopped()) return;
          const data =
            progress.bytes < 32_000_000
              ? await api.picture({ userId, organizationId, id, source }).catch(() => null)
              : null;
          if (stopped()) return;
          if (!data || !inlineRaster(data)) {
            progress.failed++;
            continue;
          }
          progress.bytes += data.length;
          root.style.setProperty(`--mail-picture-${i}`, `url("${data}")`);
          for (const img of root.querySelectorAll<HTMLImageElement>(`img[data-mail-image="${i}"]`))
            img.src = data;
          for (const alt of root.querySelectorAll<HTMLElement>(`[data-mail-alt="${i}"]`))
            alt.hidden = true;
          for (const el of root.querySelectorAll(
            `[data-mail-poster="${i}"],[data-mail-card="${i}"]`,
          ))
            el.setAttribute("data-mail-ready", "");
          doc.documentElement.removeAttribute("data-mail-compact");
        }
      };
      void Promise.all(Array.from({ length: Math.min(3, layout.sources.length) }, load)).then(
        () => {
          if (!lifetime.signal.aborted) setMissing(progress.failed > 0);
        },
      );
    }
    return () => {
      lifetime.abort();
      observer.disconnect();
      doc.removeEventListener("click", openLink);
      doc.removeEventListener("auxclick", openLink);
      doc.removeEventListener("keydown", escape);
      style.remove();
      root.remove();
    };
  }, [doc, layout, show, id, api, userId, organizationId]);
  return (
    <div className="w-full min-w-0">
      {layout.sources.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{show && missing ? "Some images are unavailable." : "External images"}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMissing(false);
              setAllowed(show ? undefined : layout);
            }}
          >
            {show ? "Hide images" : "Show images"}
          </Button>
        </div>
      )}
      <iframe
        ref={frame}
        src="/mail-body.html"
        title="Email content"
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        className="block h-px w-full border-0"
        onLoad={(e) => setDoc(e.currentTarget.contentDocument)}
      />
    </div>
  );
}
