# Requirements Template

Use this template for new feature requirements, change requests, and FRD updates.

---

## 1. Document Control

- Document: `<name>`
- Version: `<vX.Y>`
- Status: `Draft | Review | Approved`
- Date: `<YYYY-MM-DD>`
- Owner: `<name/role>`
- Related Docs: `<FRD/MES/UI/schema links>`

---

## 2. Scope

In scope:
- `<item>`
- `<item>`

Out of scope:
- `<item>`
- `<item>`

---

## 3. Requirement Entry (Copy Per Requirement)

### ID: `FR-XXX` or `NFR-XXX`
- Title: `<short title>`
- Type: `Functional | Non-Functional | Security | Reporting`
- Priority: `P0 | P1 | P2`
- Owner: `<team/person>`

Requirement statement:
- `<what must be true>`

Rationale:
- `<why this is needed>`

Actors:
- `<role(s)>`

Preconditions:
- `<state that must exist before action>`

Main flow:
1. `<step>`
2. `<step>`
3. `<step>`

Alternate/exception flows:
1. `<exception case>`
2. `<expected behavior>`

Data rules:
- `<required fields>`
- `<validation>`
- `<default values>`

Security and access:
- `<role checks>`
- `<tenant/branch scope>`

Audit and observability:
- `<what events must be logged>`
- `<which metrics/alerts are needed>`

Acceptance criteria (must be testable):
1. `<measurable expected outcome>`
2. `<measurable expected outcome>`
3. `<measurable expected outcome>`

Test evidence mapping:
- Unit tests: `<test ids>`
- Integration tests: `<test ids>`
- UAT checks: `<test ids>`

Dependencies:
- `<other requirements/services>`

Risks:
- `<known risk>`

---

## 4. Report Definition Entry (Use for REP-* IDs)

### Report ID: `REP-X-XXX`
- Name: `<report name>`
- Owner: `<role/team>`
- Priority: `P0 | P1 | P2`

Purpose:
- `<business question this report answers>`

Source data:
- Tables/views: `<list>`
- Join/filter logic: `<summary>`

Metrics:
- `<metric name>` = `<formula>`
- `<metric name>` = `<formula>`

Filters:
- Date range
- Tenant
- Branch
- `<optional filters>`

Access control:
- Allowed roles: `<roles>`
- Scope rules: `<tenant/global>`

Output:
- Columns: `<list>`
- Export: `CSV | Print | PDF`
- Timezone behavior: `<definition>`

Acceptance criteria:
1. `<formula correctness check>`
2. `<filter correctness check>`
3. `<export parity check>`

---

## 5. Change Log Entry

- Version: `<vX.Y>`
- Date: `<YYYY-MM-DD>`
- Author: `<name>`
- Reason: `<why changed>`
- Impact: `<affected modules/tests>`
- Approval: `<approver>`

---

## 6. Definition of Done Checklist

- Requirement has unique ID and priority
- Acceptance criteria are measurable and testable
- Role/tenant/branch security is explicit
- Audit and monitoring expectations are defined
- Test evidence mapping is complete
- Change log entry is created

---

END OF TEMPLATE
