# License Agreement & Legal Framework

> **The operative license for Vant is the plain MIT license in [LICENSE](LICENSE).**
> This document carries the project's governance notes and operational
> disclosures. It grants nothing and restricts nothing on its own.

> **Version 2.0** | **Vant v0.8.6+** | Last reviewed 2026-10
>
> **Change history:** v1.1 (2026-05-23) carried supplemental license terms
> (the §8 "Cantrell Clause" fork rules and §15 commercial-use restrictions)
> that were never reflected in the `LICENSE` file or `package.json`. That
> three-way contradiction was retired in v2.0: **the MIT license in
> `LICENSE` is the one and only license grant.** What survives from v1.1
> is everything that was already true under MIT: the disclosures,
> responsibilities, trademark and naming facts, and the governance norms
> (now requests and norms, not license conditions).

---

## License

**MIT.** Permission is granted, free of charge, to use, copy, modify,
merge, publish, distribute, sublicense, and/or sell copies of Vant,
subject to the notice conditions in [LICENSE](LICENSE) (the MIT
copyright + permission notice).

- **Commercial use:** allowed under MIT — including building products
  with Vant and selling what you build. Vant contributors owe you no
  support, warranty, or SLA (see the disclosures below).
- **No supplementary conditions:** earlier drafts' fork rules (§8) and
  commercial-use restrictions (§15) are retired. Nothing in this document
  narrows the MIT grant.
- **Contributor License:** by submitting PRs, contributors license their
  contributions under the project's MIT license (non-exclusive,
  worldwide, royalty-free). Contributors retain copyright to their
  contributions.

---

## Governance norms (requests, not conditions)

These are the norms the community follows out of respect and trademark
hygiene. They carry no license consequence: breach of a norm is not a
license violation. The only enforceable strings are in [LICENSE](LICENSE).

### The policy trio

Vant publishes three policies: **terms** (this document and its
disclaimers, plus the surfaces it links), **privacy**
([docs/security/privacy](docs/security/privacy.md) — what we collect
and send), and **ethics** ([docs/security/ethics](docs/security/ethics.md)
— how we influence agents and what we refuse to do, including a ban on
covert influence channels in anything we publish). Ethics is a norm
like the rest of this section, not a license condition; violations of
project commitments there are treated as security-grade bugs,
reported through the same channel.

### Attribution etiquette

**MIT already requires** keeping the copyright + permission notice that
ships with the source. Beyond that, appreciated (and the minimum
attribution language if you want to be generous):

> "This software includes Vant, an open-source framework.
> Vant is copyright The Contributors and licensed under MIT. See LICENSE file."

### Fork etiquette

**Fine under MIT (all of it):** private forks, rebranded open forks,
commercial products and services built on Vant, "Vant-as-a-Service"
offerings, selling copies (MIT explicitly allows selling).

**Requested (trademark hygiene, not a license condition):**

- **No "Vant" branding in derivative names** — "Vant" should name this
  project, not forks or wrappers; say "Built with Vant" instead.
- **Don't imply Vant core-team endorsement** with badges or logos.
  (See Badges below.)

### Academic citation

If Vant contributes to research:

```
Vant (Version [x.y.z]). Versatile Autonomous Networked Tool.
Available at: https://github.com/dhaupin/vant
```

---

## Trademark & naming facts

**"Vant"** is a descriptive acronym for this project's technical
profile: **V**ersatile **A**utonomous **N**etworked **T**ool — chosen as
a purely technical designation, explicitly **separate** from any
registered corporate trademarks in enterprise compliance, biotech, or
UI frameworks. No USPTO registration has been filed; anything asserted
is common-law use only.

**Non-affiliation (competitive separation):** Vant is independent from
all commercial entities — not affiliated with Vanta Inc., VantAI /
Roivant, Vant by Youzan, or Amazon Nova Act. The "nova" brain is named
descriptively (a new ingress to feeding the agent system), separate from
Amazon's Nova Act or any other "Nova" product. Using Vant does not imply
endorsement by any entity.

**Badges & endorsements:** none are granted for commercial ties; no
companies are endorsed; README listings are community-curated.

**Acceptable use (community norm):** use Vant for legitimate purposes.
Misusing it to attack systems you don't own, generate harmful or illegal
content, spam, phish, or DDoS reflects on the community, may draw on
external enforcement channels (provider ToS, DMCA, law), and violates
the acceptable-use expectation of the project — but it does not
*take away* anything MIT granted.

---

## Disclosures (operational reality of the software)

### Disclaimer of warranty

**VANT IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED.** Specifically:

- **NO FITNESS FOR A PARTICULAR PURPOSE** - Vant may not suit any specific
  use case.
- **NO SECURITY GUARANTEES** - Sandbox boundaries and validation layers are
  development-grade. Vulnerabilities can exist anywhere.
- **NO AVAILABILITY** - No SLA for uptime, updates, or support
- **NO MALWARE SCANNING** - Vant does not scan loaded content for malware
- **EXPERIMENTAL FEATURES** - Some features are experimental/beta and may
  change or be removed without notice; check git history for the current state.
- **THIRD-PARTY DEPENDENCIES** - Vulnerabilities in dependencies are outside
  Vant's control; users are responsible for auditing their dependency tree.

### Limitation of liability

**TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL VANT
CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
EXEMPLARY, OR CONSEQUENTIAL DAMAGES** — including data loss, security
breaches, system damage, business interruption, or lost profits.

### Security responsibilities

**Vant is a DEVELOPMENT FRAMEWORK, not a security product.** Users are
solely responsible for securing their deployments. Sandbox boundaries are
DEVELOPMENT primitives, not production security. Audit your code before
production use.

### Data handling

If you build products that process user data using Vant: you're solely
responsible for GDPR, CCPA, and other compliance. Vant doesn't inherently
protect PII/PHI; implement your own encryption and access controls. Vant
contributors assume NO data protection obligations.

### Export compliance

Vant is developed in the **United States**. Users are responsible for
ITAR, EAR, and sanctions compliance in their jurisdiction. These
obligations come from law, not from this document.

### External AI model providers

Vant connects to external AI providers (OpenAI, Anthropic, Google, Azure,
AWS, and other LLM services). You must comply with those providers' Terms
of Service, handle your own API keys securely, and understand their data
policies. Vant is not responsible for provider outages, API changes, data
sent to external providers, or costs accrued through external APIs.

### AI-generated content

Vant may generate code, text, images, or other content and makes no IP
ownership claims on generated content. You are solely responsible for
verifying the generated content is safe, legal, and appropriate, for
reviewing it before production use, and for any resulting liability.

### Autonomous behavior

Vant operates autonomously, executing tasks without continuous oversight.
You are responsible for supervising its actions (especially in
production), setting boundaries, and any consequences of autonomous
decisions. Autonomous agents can make unexpected decisions — review
actions before committing to production systems.

### Data security & brain storage

Brain files (`models/private/`, `models/public/`) may contain sensitive
data. If the brain is compromised, so is the stored data. There is **no
encryption by default** on brain files. Recommended practices: never
store real API keys or credentials in brain files, use `lib/secret.js`
for sensitive data, keep `models/private/` gitignored and private,
encrypt horcruxes before sharing, and audit brain contents regularly.

### Horcrux & backup security

Horcrux/backup files contain snapshots of brain data — unencrypted ones
expose everything they include, and restoring overwrites current state.
Best practices: password-protect horcruxes when sharing, verify integrity
before restoring, store them encrypted, and limit what data goes in.

### Rate limiting & API abuse

When using Vant against external services: respect their rate limits,
implement backoffs and retries, and don't use it for DDoS, unconsented
scraping, or spam. `lib/qos.js` provides the management primitives — use
them. Abuse commonly ends in provider key revocation and IP blocks, not
in any action by Vant contributors.

### Data retention & management

Vant does NOT enforce global data retention policies. Retention is
controlled per feature (memory/state TTLs, backup rotation
(daily/weekly), feature-specific settings) and by you via config.
Vant does not auto-delete brain content, enforce data expiration beyond
per-feature TTLs, or retain data beyond configured limits. You are
responsible for managing brain/backup cleanup and complying with any data
regulations that apply to your use case.

---

## Technical classification

| Category | Classification |
|----------|----------------|
| **Type** | Developer framework |
| **License** | MIT ([LICENSE](LICENSE)) |
| **Commercial Use** | Allowed under MIT |
| **Target Users** | Developers building AI agents |
| **Production Ready** | v0.8.6+ (see CHANGELOG) |

Vant is NOT: an enterprise compliance tool, a security product, a SAAS
platform, a managed service, or regulated software.

---

## QUICK REFERENCE

Under the MIT license in [LICENSE](LICENSE):

| Action | Allowed? |
|--------|----------|
| Use Vant in open source | Yes |
| Use Vant in closed source | Yes |
| Fork privately | Yes |
| Fork publicly (rebranded) | Yes |
| Commercial products built on Vant | Yes |
| Hosted/SAAS offerings built on Vant | Yes |
| Sell copies or support services | Yes |
| Say "Built with Vant" | Yes |
| Claim a fork IS Vant core (names/branding) | Not okay (trademark hygiene) |

Questions: open an issue on GitHub.
