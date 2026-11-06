import { useEffect, useRef, useState } from "react";

export function useProjectEditor(active: boolean) {
  const [editing, setEditing] = useState(false);
  const [restore, setRestore] = useState(0);
  const editButton = useRef<HTMLButtonElement>(null);
  const restored = useRef(0);
  useEffect(() => {
    if (restore === restored.current) return;
    restored.current = restore;
    if (active) editButton.current?.focus();
  }, [restore, active]);
  return {
    editButton,
    editor: {
      editing,
      edit: () => setEditing(true),
      done: () => {
        setEditing(false);
        setRestore((count) => count + 1);
      },
    },
  };
}
