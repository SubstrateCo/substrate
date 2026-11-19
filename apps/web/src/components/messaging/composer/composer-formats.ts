import { Bold, Code, Italic } from "lucide-react";

export const composerFormats = [
  { label: "Bold text", tooltip: "Bold", key: "b", icon: Bold, prefix: "**", suffix: "**" },
  { label: "Italic text", tooltip: "Italic", key: "i", icon: Italic, prefix: "_", suffix: "_" },
  { label: "Code text", tooltip: "Code", key: "e", icon: Code, prefix: "`", suffix: "`" },
];
