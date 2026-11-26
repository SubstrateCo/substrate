import { onPrivateStateReset } from "../../auth/private-state";
import { createTemporaryFile } from "./platform";
import { createPrivateFileManager } from "./resources";

export const privateFiles = createPrivateFileManager(createTemporaryFile);
onPrivateStateReset(() => privateFiles.clear());
