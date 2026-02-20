# Cosmic Forge Grocery POS
## Full Functional Requirements Document (FRD)

---

## 1. Purpose
Defines complete functional and non-functional requirements
for the Cosmic Forge Grocery POS system.

---

## 2. Product Overview

- Multi-tenant POS system
- Target: Myanmar grocery & retail shops
- Offline-first
- Cloud-ready, low-cost friendly

---

## 3. Branding & Logo Governance

- Logo is a system asset, not UI asset
- App branding and tenant branding are isolated
- Logo changes must not require UI refactor
- Blue-based color system preferred

---

## 4. Multi-Tenant Architecture

Each tenant represents one shop or business.

Tenant data must be fully isolated:
- Users
- Products
- Inventory
- Sales
- Reports

---

## 5. Location & Usage Control

- Tenant usage restricted by approved location
- GPS + IP + device fingerprint
- VPN detection with risk scoring

---

## 6. User Roles

- Application Owner
- Tenant Owner
- Manager
- Cashier
- Inventory Staff

Each role has controlled permissions.

---

## 7. Product & Inventory

Product fields:
- SKU / Barcode
- Name (MM / EN)
- Unit
- Retail & Wholesale prices
- Tax category
- Stock alert

Inventory actions:
- Stock in / out
- Adjustment
- Damage
- Transfer

---

## 8. Sales

- Retail & wholesale supported
- Discount rules
- Dynamic tax calculation
- Offline transaction queue

---

## 9. Customer & Loyalty

- Customer profiles
- Purchase history
- Loyalty points
- Tier system

---

## 10. Reports

Core Tenant Reports: 8  
Application Owner Reports: 8  
Optional Advanced Reports: 3–4  

Total: 19–20 reports

---

## 11. Monitoring & Security

- Performance monitoring
- Backup & recovery
- Database security & indexes
- Abuse detection
- Safe updates

---

## 12. Tax Compliance

- Configurable tax rules
- Effective-date based
- No hardcoded tax logic

---

END OF DOCUMENT
