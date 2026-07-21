# Simple Guide: PO Creation

This guide explains how to create a Purchase Order (PO) in the Store KG system.

## What Is A PO?

- PO means Purchase Order.
- A PO is created when requested items are not fully available in store stock.
- The PO is linked to a Store Requisition (SR).
- The PO tells the supplier what item to provide, how much quantity is needed, and the expected cost.

## Who Can Create A PO?

- Admin
- Store Admin
- Purchase User

## Before Creating A PO

- Make sure a Store Requisition is already created.
- The Store Requisition must be approved.
- The requisition must have at least one item that needs purchase.
- The supplier must already exist in the system.
- The item must already exist in the item master.

## When A PO Is Needed

- Requested quantity is more than available stock.
- Item stock is zero.
- Part of the request can be issued from stock, but remaining quantity must be purchased.
- Store team marks or identifies the item as purchase required.

## PO Creation Steps

- Open the Procurement or Purchase Order section.
- Select an approved Store Requisition.
- Check the shortfall items.
- Select the supplier.
- Review item quantity and price.
- Add notes if required.
- Add delivery date or payment terms if needed.
- Submit the PO.

## What The System Does Automatically

- Checks if the Store Requisition is approved.
- Checks if the supplier exists.
- Checks if the selected items belong to the linked requisition.
- Prevents duplicate PO creation for the same requisition.
- Creates a unique PO number.
- Calculates total PO amount.
- Creates PO line items.
- Changes the Store Requisition status to `CONVERTED_TO_PO`.
- Starts the PO approval workflow.
- Creates an audit log for tracking.

## PO Number Format

- PO number is generated automatically.
- Format is:

```text
PO-YYYYMMDD-001
```

- Example:

```text
PO-20260717-001
```

## PO Status Meaning

- `DRAFT`: PO is created but not approved yet.
- `PENDING_APPROVAL`: PO is waiting for approval.
- `APPROVED`: PO is approved and ready for supplier action.
- `SENT_TO_SUPPLIER`: PO has been sent to supplier.
- `PARTIALLY_RECEIVED`: Some items are received.
- `FULLY_RECEIVED`: All items are received.
- `INVOICE_PENDING`: Goods received, invoice still pending.
- `CLOSED`: PO process is complete.
- `CANCELLED`: PO is cancelled.

## Common Problems

- Store Requisition is not approved.
- Supplier is missing or inactive.
- Item is not part of the selected requisition.
- PO already exists for the same requisition.
- No shortfall item is available for purchase.
- Quantity or price is missing or invalid.

## Quick Checklist

- Approved Store Requisition selected.
- Supplier selected.
- Item quantity checked.
- Price checked.
- Delivery date checked, if needed.
- Payment terms checked, if needed.
- PO submitted successfully.
- PO status checked after creation.

## Simple Example

- Store Requisition asks for 50 gloves.
- Store has only 20 gloves available.
- Shortfall is 30 gloves.
- System creates PO for 30 gloves.
- Store Requisition becomes `CONVERTED_TO_PO`.
- PO goes for approval.

## Final Notes

- Do not create a PO manually without linking it to a Store Requisition.
- Always check supplier and quantity before submitting.
- If the PO already exists, use the existing PO instead of creating another one.
- After approval, continue with supplier sending, goods receipt, invoice, and closing process.
