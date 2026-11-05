import { AppearanceControl } from "@startup-os/ui/theme/appearance-control";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@startup-os/ui/primitives/card";

export function UserAppearance() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Choose a theme for this browser. This does not change your organization’s settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AppearanceControl />
      </CardContent>
    </Card>
  );
}
