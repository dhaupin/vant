import { NotConnected } from "../../frame/conn";

/**
 * Module: users (catalog #13, Tier S). Dashboard accounts do not exist
 * yet (they land with P2 email-OTP logins, prd-web.md 3.5). This page
 * states that plainly rather than drawing an account table that cannot
 * exist - the PRD's honesty contract applied to a missing feature.
 */
export default function Users() {
  return (
    <NotConnected
      why="Dashboard accounts (admins/viewers, email + one-time code) arrive with P2 email-OTP logins; the store binding is defined in Pages settings then. Pod guests are a different layer - they live on the Guests page and are door-managed."
    />
  );
}
