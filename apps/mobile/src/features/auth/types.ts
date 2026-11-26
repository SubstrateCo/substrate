export type AuthMode = "login" | "verify" | "forgot" | "reset" | "invite";

export interface AuthScreenProps {
  mode?: AuthMode;
  token?: string;
  error?: string;
  email?: string;
  invitationId?: string;
  destination?: string;
  onAuthenticated?: (destination?: string) => void;
  onModeChange?: (mode: AuthMode, email: string) => void;
}

export interface WorkspacePickerProps {
  onSelect: (id: string) => void;
  invitationId?: string;
}
