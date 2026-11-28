import { ruleTester } from "../test-support.ts";
import { noNativeDateInput } from "./no-native-date-input.ts";

ruleTester.run("no-native-date-input", noNativeDateInput, {
  valid: [
    '<input type="datetime-local" />',
    '<input type="hidden" value="2026-11-23" />',
    "<input type={kind} />",
    '<input type="date" />',
    '<DateField label="Due date" value={value} onChange={setValue} />',
    'import { Input } from "another-library"; <Input type="date" />;',
    'function Input() { return null; } <Input type="date" />;',
    'import { Input } from "@/components/ui/input"; function View(Input) { return <Input type="date" />; }',
  ],
  invalid: [
    {
      code: 'import { Input as DateInput } from "@/components/ui/input"; <DateInput type="date" />;',
      errors: [{ messageId: "date" }],
    },
    {
      code: 'import * as Fields from "../ui/input"; <Fields.Input type="date" />;',
      errors: [{ messageId: "date" }],
    },
    {
      code: 'import { NativeField } from "@/components/forms/native-form"; <NativeField label="Due" type="date" />;',
      errors: [{ messageId: "date" }],
    },
    {
      code: 'import { FormTextField } from "../forms/form-text-field"; <FormTextField type={`date`} />;',
      errors: [{ messageId: "date" }],
    },
  ],
});
