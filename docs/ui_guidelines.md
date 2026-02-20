# UI Governance Guidelines (Authoritative)
Cosmic Forge Grocery POS

---

## 1. Core Principles

1. UI must never embed logo assets, brand colors, tax logic, or pricing logic directly.
2. Brand assets must be loaded only through `BrandService`.
3. UI hiding is not security; all permission enforcement is backend-authoritative.
4. POS flows prioritize speed, clarity, and error prevention.

---

## 2. Visual System

### 2.1 Layout

- Responsive across desktop/tablet/mobile.
- Mandatory shell:
  - Top bar (tenant, branch, logged-in user)
  - Side navigation (explicit labels)
  - Main content area (title, action, content)
- No hidden critical actions.

### 2.2 Color and Typography

- Blue-based business palette (no gold-dominant theme).
- Support light and dark modes.
- Tenant themes must not override semantic safety colors.
- Clean sans-serif typography; no decorative fonts.
- Red is reserved for destructive actions.

### 2.3 Component Behavior

- Tables: sticky headers, clear labels, inline actions.
- Forms: visible labels, inline validation, required markers.
- Buttons: one primary action per screen; predictable secondary/destructive actions.

### 2.4 Error Severity Hierarchy

- `INFO`: neutral operational feedback (sync complete, refresh complete).
- `WARN`: degraded but recoverable state (offline, queued retry, policy warning).
- `CRITICAL`: blocking state (risk block, replay window expiry, data lock).
- Severity presentation must be visually distinct and text-explicit.
- Every lock/escalation state must include a stable explanation code and a user-facing message.

### 2.5 Accessibility Baseline

- interactive controls must be keyboard reachable (`Tab`, `Shift+Tab`, `Enter`, `Space`).
- visible focus indicator is mandatory for links/buttons/inputs.
- form controls must expose textual labels; placeholder-only controls are forbidden.
- status and alert regions must use live-region semantics for operational changes.

---

## 3. Offline and Sync UX (Mandatory)

### 3.1 Offline State Visibility

When connectivity is lost:
- show persistent `OFFLINE` status indicator
- show queue size and sync pending count
- continue allowed offline flows (sales, receipt, stock movement queueing)

### 3.2 Read-Only Fallback States

Read-only mode must be explicit with visible banner and disabled actions when:
- risk policy enforces `READ_ONLY`
- data corruption safeguards trigger read-only lock
- unresolved critical sync failure requires temporary lock

### 3.3 Sync Progress Visibility

- each queued transaction displays state: `PENDING`, `SYNCING`, `CONFLICT`, `FAILED`, `CONFIRMED`
- failed transactions must show retry action and error reason

### 3.4 Minimal Cashier Explanation Mode

- cashier-facing lock messages must be short and action-oriented.
- explanation code remains visible for support triage.
- manager/owner views can show full detail and policy context.

### 3.5 Policy-Failure Fallback UX

- if policy preview/validation fails, affected mutation controls must be disabled.
- fallback banner must clearly state the module is safety-locked.
- fallback state must never silently allow mutation behavior.

---

## 4. Conflict UX Governance (Non-Silent)

1. Silent conflict resolution is forbidden.
2. User must see conflict details:
   - affected entity
   - local value
   - server value
   - applied/default policy
3. Conflict screen must provide clear next action:
   - retry
   - escalate
   - resolve (if authorized)

### 4.1 Conflict Resolution Roles

- `TENANT_OWNER` and `MANAGER` can resolve business conflicts.
- `APPLICATION_OWNER` can resolve global/system conflicts.
- `CASHIER` and `INVENTORY_STAFF` cannot finalize conflict resolution; they can only view and escalate.

### 4.2 Required Resolution Metadata

Resolved conflict must capture:
- resolver user id
- tenant id
- branch id (if applicable)
- resolution choice
- reason note
- timestamp

---

## 5. Branding Rules

- App brand and tenant brand are isolated.
- Logo files are system assets, not hardcoded UI assets.
- SVG preferred; container controls render size.

---

## 6. Forbidden UI Patterns

- heavy animations in operational flows
- visual-first dashboards without business meaning
- oversized logos
- hidden destructive actions
- unresolved error states without user guidance
- color-only error communication without text label

---

## 7. Governance Rule

Any UI implementation that violates this document must be rejected and reworked.

---

END OF DOCUMENT
