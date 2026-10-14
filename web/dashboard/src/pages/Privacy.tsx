import { Page, P } from "./Terms";

/**
 * Privacy (prd-web.md 10): plainly states what this dashboard does and
 * does not collect. MVP: token pasted per load, memory only; P2 email
 * OTP is used for login codes only.
 */
export default function Privacy() {
  return (
    <Page title="Privacy">
      <P>
        The dashboard is a thin window onto YOUR Vant pod. It runs static
        code from this Pages deployment; its only server-side part is the
        Worker function bridging your browser to your pod.
      </P>
      <P>
        This project does NOT collect analytics, does NOT sell data, and
        does NOT share your brain content. Your pod is yours; what it
        stores is up to you.
      </P>
      <P>
        Today: the guest token you paste lives in the browser's memory
        for the session and is forwarded to your pod through the bridge.
        It is never logged by the bridge and never leaves your session.
      </P>
      <P>
        When email-code sign-in lands (roadmap P2), your email is used
        for login codes only; codes are stored hashed and expire in
        minutes. That will be stated on this page as it ships.
      </P>
      <P>
        Questions: the audit page shows this dashboard's own event
        ledger; the repo is open, so you can read exactly what the code
        does.
      </P>
    </Page>
  );
}
