---
name: security-review
description: Scan a code change for security vulnerabilities and map findings to a recognized framework (OWASP Top 10 / CWE). Focused on reviewing diffs and commits for exploitable flaws, distinct from up-front threat modeling. Use before merging security-sensitive changes or when asked to check code for vulnerabilities.
user-invocable: true
trigger: Reviewing a diff, commit, or file for exploitable security flaws — input handling, auth, secrets, injection — and wanting findings mapped to OWASP/CWE.
---

# Security Review

Examine a code change specifically for security holes and report each mapped to a known category. This is the reactive, diff-level counterpart to threat modeling: threat modeling asks "what could attack this system"; this asks "does this change introduce an exploitable flaw."

Note: for whole-system, up-front risk analysis, use the `threat-model` skill in this catalog instead.

## What to look for

- **Injection** — SQL/NoSQL, command, template, and header injection; any place untrusted input reaches an interpreter.
- **Input validation** — missing or weak validation, unsafe deserialization, path traversal, SSRF.
- **AuthN/AuthZ** — missing authentication, broken access control, privilege escalation, insecure direct object references.
- **Secrets & crypto** — hard-coded credentials or keys, secrets in logs, weak or misused cryptography, predictable tokens.
- **Data exposure** — sensitive data in responses/logs/errors, missing encryption in transit or at rest.
- **Dependencies & config** — known-vulnerable packages, insecure defaults, permissive CORS, debug endpoints left on.

## Output

For each finding:

| Severity | Category (OWASP/CWE) | Location | Vulnerability | Remediation |
|----------|----------------------|----------|---------------|-------------|
| critical / high / medium / low | e.g. A03:2021 Injection / CWE-89 | file:line | how it's exploitable | the concrete fix |

End with a **verdict**: block (any critical/high) or pass, plus a one-line summary.

## Rules

- Show the exploit path — *why* it's a vulnerability, not just a label.
- Map every finding to an OWASP Top 10 or CWE identifier so it's actionable and trackable.
- Rank by exploitability and impact; a hard-coded production key outranks a theoretical low.
- No real findings? Say so — don't manufacture severity.
