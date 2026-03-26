# Mobile Inventory Control

Mobile-first web app for phone-store staff to:

- search inventory and see MOP
- add stock unit by unit with IMEI
- sell a device by IMEI
- run weekly audits against active IMEIs
- review activity and audit exceptions

## Run

Open `index.html` in a browser.

For barcode scanning, use a browser that supports:

- `navigator.mediaDevices.getUserMedia`
- `BarcodeDetector`

If scanning is unsupported or a barcode is damaged, the app allows manual IMEI fallback with validation.

## Current storage

This implementation stores data in browser `localStorage` under `mobile-store-inventory-v1`.

## Notes

- Mobiles are tracked per unit by IMEI.
- Add-product intake is one phone per submission, with one IMEI per unit.
- Visible quantity is computed from unsold IMEI units.
- Audit compares scanned IMEIs with active in-stock IMEIs.
- Logs capture stock intake, sales, and audit submissions.
