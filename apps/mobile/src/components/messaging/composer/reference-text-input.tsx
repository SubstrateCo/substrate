import type { ReferenceEditorProps } from "./reference-editor-props";
import { ReferenceTextInput as NativeReferenceTextInput } from "./reference-text-input.native";

// Metro selects .native or .web. TypeScript uses this native contract.
export function ReferenceTextInput(props: ReferenceEditorProps) {
  return <NativeReferenceTextInput {...props} />;
}
