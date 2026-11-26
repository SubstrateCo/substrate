import { ruleTester } from "../test-support.ts";
import { usePrimitives } from "./use-primitives.ts";

ruleTester.run("use-primitives", usePrimitives, {
  valid: [
    'import { Button } from "@/components/ui/button"; <Button onPress={save} />;',
    'import { View } from "react-native"; <View style={{ width: 16 }} />;',
    'import type { TriggerProps } from "@rn-primitives/dialog";',
    'import { type TriggerProps } from "@rn-primitives/dialog";',
    'import { PortalHost } from "@rn-primitives/portal"; <PortalHost />;',
    'import { Pressable } from "./gesture-surface"; <Pressable />;',
    'import { Pressable } from "react-native"; function A(Pressable) { return <Pressable />; }',
  ],
  invalid: [
    ...[
      'import { Pressable } from "react-native"; <Pressable onPress={save} />;',
      'import { Pressable as Action } from "react-native"; <Action />;',
      'import * as RN from "react-native"; <RN.TouchableOpacity />;',
      'import { Button } from "react-native"; <Button title="Save" onPress={save} />;',
      'import { TouchableHighlight } from "react-native-gesture-handler"; <TouchableHighlight />;',
    ].map((code) => ({ code, errors: [{ messageId: "button" }] })),
    {
      code: 'import * as DialogPrimitive from "@rn-primitives/dialog";',
      errors: [{ messageId: "primitive" }],
    },
    {
      code: 'import { Root, type TriggerProps } from "@rn-primitives/dialog";',
      errors: [{ messageId: "primitive" }],
    },
    {
      code: 'import { PortalHost, Portal } from "@rn-primitives/portal";',
      errors: [{ messageId: "primitive" }],
    },
  ],
});
