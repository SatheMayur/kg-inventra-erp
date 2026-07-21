# Product Requirements Document (PRD)
**Project Name:** KG_inventra
**Document Version:** 2.0 (Redesigned Architecture)
**Date:** June 2026

## 1. Executive Summary
Following the removal of legacy third-party integrations (Petpooja & FG Inventory), KG_inventra is shifting from a passive dashboard to an active, conversational ERP system. This PRD outlines the re-architecture of the core business logic to deeply integrate real-time WhatsApp capabilities (via the waha-bridge). The goal is to reduce operational latency by bringing approvals, alerts, and stock-checks directly to the user's phone.

## 2. Objectives & Goals
- **Conversational Access:** Allow employees to check stock levels and submit requisitions via WhatsApp.
- **Proactive Notifications:** Automatically send Purchase Orders to suppliers and Low-Stock alerts to admins.
- **Unified Communication Ledger:** Track all supplier and employee communications directly within the ERP alongside inventory transactions.
- **Architectural Separation:** Decouple business logic from API route handlers into dedicated service classes to support multi-channel triggers (Web, WhatsApp, Cron).

## 3. User Personas
- **Admin (Store Manager):** Needs to approve requests, send POs, and receive instant alerts for critical stock-outs.
- **Employee (Department Head):** Wants to request stock without logging into a web portal; prefers a conversational interface.
- **Supplier:** Receives Purchase Orders as PDF attachments via WhatsApp and confirms receipt.
- **AI Agent (Gemini):** Processes natural language WhatsApp inbound messages and translates them into actionable ERP operations (e.g., "Check stock for Coffee Beans").

## 4. Architectural Redesign
The current tightly-coupled MVC-like architecture will be transitioned to a **Service-Oriented Architecture** pattern:

### 4.1 Business Logic Layer
All raw database access (`db.item.findUnique`, etc.) currently located inside Next.js API Routes (`/api/.../route.ts`) will be extracted into shared Service Classes (e.g., `InventoryService.ts`, `ProcurementService.ts`). 
*Why?* A stock deduction can now be triggered by an Admin clicking "Approve" on the web, OR an Admin replying "YES" on WhatsApp. Both must funnel through the exact same logic.

### 4.2 Event-Driven Architecture
- **Inbound Webhook (`/api/v1/wa/inbound`):** Receives raw text from the waha-bridge, classifies intent (using AI or Regex), and triggers the corresponding Service Class.
- **Outbound Webhook (`/api/v1/wa/poll`):** Stores outgoing messages in a database table (`WhatsAppQueue`) which the bridge consumes every 3 seconds.

## 5. Core Workflows
### 5.1 Conversational Requisitions
1. Employee sends WA message: *"Need 5kg of Sugar for Kitchen."*
2. System parses intent -> creates `DRAFT` requisition.
3. System replies: *"Created Requisition #REQ-102. Waiting for Admin approval."*
4. System texts Admin: *"Employee X requested 5kg Sugar. Reply 'APP REQ-102' to approve."*

### 5.2 Automated Purchase Orders
1. Admin creates and approves a PO in the Web UI.
2. System automatically generates a PDF.
3. System queues a message to the Supplier's registered WA number: *"Attached is PO-2024-001 from KG Store."* + PDF File.
4. ERP logs the message status in the PO timeline.

## 6. Data Model Updates (Prisma)
The following tables will be introduced to support the new business logic:
- `WhatsAppMessage`: Tracks inbound and outbound messages (ID, From, To, Body, Timestamp, Status).
- `UserContacts`: Maps ERP User IDs to WhatsApp phone numbers.
- `SupplierContacts`: Maps Supplier IDs to WhatsApp phone numbers.

## 7. Out of Scope for Phase 1
- Complete AI automation of purchasing negotiations.
- Voice note processing.
- Multi-number scaling (bridge supports single number for now).
