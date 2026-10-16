import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** Shared layout for the legal pages (frame-owned, module 6 in the catalog). */
export function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="mt-4 max-w-2xl space-y-3 text-sm text-ink-soft">{children}</div>
      <p className="mt-6 text-xs">
        <Link to="/" className="text-accent hover:underline">
          Back to the dashboard
        </Link>
      </p>
    </div>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

/**
 * Terms (prd-web.md 10): honest, plain language, calibrated to LEGAL.md's
 * posture. OSS, no warranty, no liability for data loss / PII leaks /
 * what the agents do. Use at your own risk.
 */
export default function Terms() {
  return (
    <Page title="Terms of use">
      <P>
        Vant, and this dashboard (codename Bolete), are open-source
        software. This dashboard is a window onto YOUR OWN Vant pod: it
        displays and forwards requests to systems you operate.
      </P>
      <P>
        NO WARRANTY: the software is provided as-is, without any
        guarantee of fitness, availability, or correctness. Data can be
        lost. Use at your own risk.
      </P>
      <P>
        NO LIABILITY: we are not responsible for data loss, PII leaks, or
        anything the agents on your pods do. Agents act autonomously
        according to the boundaries you configure; you approve their
        writes.
      </P>
      <P>
        NO DATA COLLECTION BY THE PROJECT: the dashboard does not ship
        your tokens or your brain data anywhere. What your pod and your
        infra do is governed by your own deployment.
      </P>
      <P>
        The upstream license and its supplemental terms live in the
        repo's LEGAL.md. This page is an honest summary, not legal
        advice.
      </P>
    </Page>
  );
}
