import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
  render,
  toPlainText,
} from "react-email";

interface TransactionalEmailProps {
  preview: string;
  category: string;
  title: string;
  description: string;
  action: string;
  url: string;
  context?: { label: string; name: string; detail?: string };
  notice: string;
  next?: string;
}

// sRGB equivalents of background, foreground, card, inset, muted-foreground,
// border, primary, and primary-foreground in apps/web/src/components/styles.css.
// Email clients cannot reliably use the renderer's OKLCH colors or CSS variables.
const colors = {
  background: "#f6f7f8",
  ink: "#202126",
  card: "#ffffff",
  inset: "#f3f4f8",
  muted: "#5d606b",
  line: "#dcdee4",
  accent: "#5248c7",
  buttonText: "#fafafa",
};
const darkColors = {
  background: "#101117",
  ink: "#dfe1e7",
  card: "#1c1e25",
  inset: "#12131a",
  muted: "#9b9eaa",
  line: "rgba(255, 255, 255, 0.09)",
  accent: "#a2a8fc",
  buttonText: "#131428",
};
const darkStyles = `
  .email-page, .email-page > table > tbody > tr > td { background-color: ${darkColors.background} !important; color: ${darkColors.ink} !important; }
  .email-ink { color: ${darkColors.ink} !important; }
  .email-muted { color: ${darkColors.muted} !important; }
  .email-card { background-color: ${darkColors.card} !important; border-color: ${darkColors.line} !important; }
  .email-inset { background-color: ${darkColors.inset} !important; border-color: ${darkColors.line} !important; }
  .email-rule { border-color: ${darkColors.line} !important; }
  .email-accent { color: ${darkColors.accent} !important; }
  .email-action, .email-mark { background-color: ${darkColors.accent} !important; color: ${darkColors.buttonText} !important; }
  .email-mark-dot { background-color: ${darkColors.buttonText} !important; }
`;
const paragraph = { fontSize: "15px", lineHeight: "25px", color: colors.muted };

function TransactionalEmail({
  preview,
  category,
  title,
  description,
  action,
  url,
  context,
  notice,
  next,
}: TransactionalEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{`
          :root { color-scheme: light dark; }
          @media (prefers-color-scheme: dark) { ${darkStyles} }
          @media only screen and (max-width: 600px) {
            .email-outer { padding: 24px 12px !important; }
            .email-content { padding: 32px 24px !important; }
            .email-title { font-size: 28px !important; line-height: 34px !important; }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body
        className="email-page"
        style={{
          margin: 0,
          backgroundColor: colors.background,
          color: colors.ink,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
        }}
      >
        <Section tdClassName="email-outer" style={{ padding: "48px 16px" }}>
          <Container style={{ maxWidth: "560px", margin: "0 auto" }}>
            <Section style={{ padding: "0 8px 24px" }} data-skip-in-text="true">
              <Row>
                <Column style={{ width: "40px" }}>
                  <table
                    className="email-mark"
                    role="presentation"
                    cellPadding="0"
                    cellSpacing="0"
                    style={{ backgroundColor: colors.accent, borderRadius: "8px", width: "32px" }}
                  >
                    <tbody>
                      <tr>
                        <td style={{ padding: "8px" }}>
                          <table role="presentation" cellPadding="0" cellSpacing="0" width="16">
                            <tbody>
                              <tr>
                                <td
                                  className="email-mark-dot"
                                  width="7"
                                  height="7"
                                  style={{
                                    backgroundColor: colors.buttonText,
                                    borderRadius: "2px",
                                  }}
                                />
                                <td width="2" />
                                <td
                                  className="email-mark-dot"
                                  width="7"
                                  style={{
                                    backgroundColor: colors.buttonText,
                                    opacity: 0.6,
                                    borderRadius: "2px",
                                  }}
                                />
                              </tr>
                              <tr>
                                <td height="2" colSpan={3} />
                              </tr>
                              <tr>
                                <td
                                  className="email-mark-dot"
                                  height="7"
                                  style={{
                                    backgroundColor: colors.buttonText,
                                    opacity: 0.6,
                                    borderRadius: "2px",
                                  }}
                                />
                                <td />
                                <td
                                  className="email-mark-dot"
                                  style={{
                                    backgroundColor: colors.buttonText,
                                    borderRadius: "4px",
                                  }}
                                />
                              </tr>
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Column>
                <Column
                  className="email-ink"
                  style={{
                    color: colors.ink,
                    fontSize: "17px",
                    fontWeight: 650,
                    letterSpacing: "-0.5px",
                  }}
                >
                  Substrate
                </Column>
              </Row>
            </Section>
            <Section
              className="email-card"
              tdClassName="email-content"
              style={{
                backgroundColor: colors.card,
                border: `1px solid ${colors.line}`,
                borderRadius: "16px",
                padding: "40px",
              }}
            >
              <Text
                className="email-accent"
                style={{
                  margin: "0 0 16px",
                  fontSize: "12px",
                  lineHeight: "18px",
                  fontWeight: 600,
                  color: colors.accent,
                }}
              >
                {category}
              </Text>
              <Heading
                as="h1"
                className="email-title email-ink"
                style={{
                  color: colors.ink,
                  margin: "0 0 16px",
                  fontSize: "32px",
                  lineHeight: "38px",
                  fontWeight: 650,
                  letterSpacing: "-1px",
                  overflowWrap: "anywhere",
                }}
              >
                {title}
              </Heading>
              <Text className="email-muted" style={{ ...paragraph, margin: "0 0 28px" }}>
                {description}
              </Text>
              {context && (
                <Section
                  className="email-inset"
                  style={{
                    backgroundColor: colors.inset,
                    border: `1px solid ${colors.line}`,
                    borderRadius: "10px",
                    padding: "20px",
                    marginBottom: "28px",
                  }}
                >
                  <Text
                    className="email-muted"
                    style={{
                      margin: "0 0 6px",
                      fontSize: "12px",
                      lineHeight: "18px",
                      color: colors.muted,
                    }}
                  >
                    {context.label}
                  </Text>
                  <Text
                    className="email-ink"
                    style={{
                      color: colors.ink,
                      margin: 0,
                      fontSize: "17px",
                      lineHeight: "25px",
                      fontWeight: 600,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {context.name}
                  </Text>
                  {context.detail && (
                    <Text
                      className="email-muted"
                      style={{
                        ...paragraph,
                        fontSize: "13px",
                        lineHeight: "21px",
                        margin: "8px 0 0",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {context.detail}
                    </Text>
                  )}
                </Section>
              )}
              <Button
                className="email-action"
                href={url}
                style={{
                  backgroundColor: colors.accent,
                  borderRadius: "8px",
                  color: colors.buttonText,
                  fontSize: "14px",
                  fontWeight: 600,
                  lineHeight: "20px",
                  padding: "14px 24px",
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                {action}
              </Button>
              {next && (
                <Text
                  className="email-muted"
                  style={{ ...paragraph, fontSize: "13px", lineHeight: "21px", margin: "16px 0 0" }}
                >
                  {next}
                </Text>
              )}
              <Hr
                className="email-rule"
                style={{ borderColor: colors.line, margin: "32px 0 24px" }}
              />
              <Text
                className="email-muted"
                style={{ ...paragraph, fontSize: "13px", lineHeight: "21px", margin: 0 }}
              >
                {notice}
              </Text>
            </Section>
            <Section style={{ padding: "24px 8px 0" }}>
              <Text
                className="email-muted"
                style={{
                  fontSize: "12px",
                  lineHeight: "20px",
                  color: colors.muted,
                  margin: "0 0 8px",
                }}
                data-skip-in-text="true"
              >
                Button not working? Copy and paste this link into your browser:
                <br />
                <Link
                  className="email-muted"
                  href={url}
                  style={{
                    color: colors.muted,
                    textDecoration: "underline",
                    wordBreak: "break-all",
                  }}
                >
                  {url}
                </Link>
              </Text>
              <Text
                className="email-muted"
                style={{
                  fontSize: "12px",
                  lineHeight: "20px",
                  color: colors.muted,
                  margin: "16px 0 0",
                }}
              >
                Substrate · A shared place for your work.
              </Text>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

export async function renderTransactionalEmail(props: TransactionalEmailProps) {
  const html = await render(<TransactionalEmail {...props} />);
  return { html, text: toPlainText(html) };
}
