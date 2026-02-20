# Discount Policy Change Impact Template

Version: v1.0  
Date: 2026-02-20  
Owner: Product + Engineering

---

## Change Header

1. Policy version:
2. Effective from:
3. Effective to:
4. Tenant scope:
5. Change ticket:

## Policy Delta

1. Precedence order changes:
2. Cap changes:
3. Conflict rule changes:
4. Coupon map changes:
5. Reason code changes (must be enum-stable):

## Impact Assessment

1. Checkout math impact:
2. Loyalty synergy impact:
3. Cashier flow impact:
4. Reporting delta impact:
5. Backward compatibility notes:

## Required Evidence

1. Boundary tests at exact cap values.
2. Localized reason message validation.
3. Policy preview API cache/etag validation.
4. E2E discount rejection + breakdown validation.
5. Traceability matrix and changelog updates.

## Sign-Off

1. Product:
2. Engineering:
3. QA:
4. Release:

