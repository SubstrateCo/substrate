import { useEffect, useRef, useState } from "react";

export function useProjectEditor(active: boolean) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && !editing && active) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing, active]);
  return {
    editButton,
    editor: {
      editing,
      edit: () => setEditing(true),
      done: () => setEditing(false),
    },
  };
}
