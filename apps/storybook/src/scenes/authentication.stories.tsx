import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { LoginForm } from "@startup-os/ui/auth/login-form";
import { SignupForm } from "@startup-os/ui/auth/signup-form";
import { ForgotPasswordForm } from "@startup-os/ui/auth/forgot-password-form";
import { ResetPasswordForm } from "@startup-os/ui/auth/reset-password-form";
import { VerifyEmailScreen } from "@startup-os/ui/auth/verify-email-screen";

const meta = { title: "Scenes/Authentication" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const login = { onSubmit: fn(), forgotPasswordHref: "#forgot-password", signupHref: "#signup" };
const signup = { onSubmit: fn(), loginHref: "#login" };
const reset = { ...signup, requestResetHref: "#forgot-password" };
const verify = { ...signup, email: "taylor@example.com" };

export const SignIn: Story = { render: () => <LoginForm {...login} /> };
export const SignInPrefilled: Story = {
  render: () => <LoginForm {...login} email="taylor@example.com" />,
};
export const SigningIn: Story = { render: () => <LoginForm {...login} pending /> };
export const InvalidCredentials: Story = {
  render: () => (
    <LoginForm
      {...login}
      email="taylor@example.com"
      error={new Error("Invalid email or password.")}
    />
  ),
};
export const SignUp: Story = { render: () => <SignupForm {...signup} /> };
export const CreatingAccount: Story = { render: () => <SignupForm {...signup} pending /> };
export const SignUpError: Story = {
  render: () => (
    <SignupForm {...signup} error={new Error("An account with this email already exists.")} />
  ),
};
export const ForgotPassword: Story = { render: () => <ForgotPasswordForm {...signup} /> };
export const SendingResetLink: Story = { render: () => <ForgotPasswordForm {...signup} pending /> };
export const ResetLinkSent: Story = { render: () => <ForgotPasswordForm {...signup} success /> };
export const ResetRequestError: Story = {
  render: () => (
    <ForgotPasswordForm {...signup} error={new Error("Could not request a password reset.")} />
  ),
};
export const NewPassword: Story = { render: () => <ResetPasswordForm {...reset} /> };
export const PasswordMismatch: Story = {
  render: () => <ResetPasswordForm {...reset} error={new Error("The passwords do not match.")} />,
};
export const InvalidResetLink: Story = { render: () => <ResetPasswordForm {...reset} invalid /> };
export const SavingPassword: Story = { render: () => <ResetPasswordForm {...reset} pending /> };
export const PasswordChanged: Story = { render: () => <ResetPasswordForm {...reset} success /> };
export const VerifyEmail: Story = { render: () => <VerifyEmailScreen {...verify} /> };
export const InvalidVerificationLink: Story = {
  render: () => <VerifyEmailScreen {...verify} invalid />,
};
export const SendingVerification: Story = {
  render: () => <VerifyEmailScreen {...verify} pending />,
};
export const VerificationSent: Story = { render: () => <VerifyEmailScreen {...verify} success /> };
export const VerificationError: Story = {
  render: () => (
    <VerifyEmailScreen {...verify} error={new Error("Could not send verification email.")} />
  ),
};
export const MobileSignIn: Story = {
  render: () => <LoginForm {...login} />,
  globals: { viewport: { value: "narrow" } },
};
