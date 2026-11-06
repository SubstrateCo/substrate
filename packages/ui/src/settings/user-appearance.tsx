import { AppearanceControl } from "../theme/appearance-control";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../primitives/card";

export function UserAppearance() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>
          Choose a theme for this device. This does not change your organization's settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AppearanceControl />
      </CardContent>
    </Card>
  );
}
