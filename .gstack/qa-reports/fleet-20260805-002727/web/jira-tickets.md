## [web] Placeholder "screenshot" boxes on /product page

**Priority:** Medium
**Environment:** web — http://localhost:56010

**Description**
Expected: The three feature callouts on the /product page (Browser Extension, Pretzel Console, AI Policy Assistant) should each show a real product screenshot.
Actual: All three render as empty dark-gray placeholder boxes containing only the label text ("Browser Extension screenshot", "Pretzel Console screenshot", "AI Policy Assistant screenshot") — no image is present.

**Steps to Reproduce**
1. Navigate to http://localhost:56010/product
2. Scroll through the three feature sections (Browser Extension / Pretzel Console / AI Policy Assistant)
3. **Observe:** each screenshot slot shows an empty placeholder box instead of a real image.

**Screenshots:** screenshots/04-product.png
