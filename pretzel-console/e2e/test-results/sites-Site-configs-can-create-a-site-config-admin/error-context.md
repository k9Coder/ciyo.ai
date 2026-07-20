# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sites.spec.ts >> Site configs >> can create a site config
- Location: e2e\sites.spec.ts:50:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('e2e-test-site.internal')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('e2e-test-site.internal')

```

```yaml
- complementary:
  - link "Pretzel logo Pretzel by mykka.ai":
    - /url: /dashboard
    - img "Pretzel logo"
    - text: Pretzel by mykka.ai
  - text: Organization Test's Organization
  - navigation:
    - link "▦ Dashboard":
      - /url: /dashboard
    - link "⊡ Policies":
      - /url: /subjects
    - link "⊞ Teams":
      - /url: /org
    - link "◎ Members":
      - /url: /members
    - link "≡ Audit Log":
      - /url: /audit
    - link "AI Assistant":
      - /url: /assistant
      - img
      - text: AI Assistant
    - link "⚙ Settings":
      - /url: /settings
  - button "Open user menu":
    - img "test user's logo"
  - text: test user Admin
- button "☀"
- heading "Site Configs" [level=1]
- button "+ New site"
- status "Loading":
  - img
- dialog:
  - heading "New site config" [level=2]
  - text: Domain
  - textbox "Domain":
    - /placeholder: chat.openai.com
    - text: e2e-test-site.internal
  - text: Input selector (CSS)
  - textbox "Input selector (CSS)":
    - /placeholder: "#prompt-textarea"
    - text: "#prompt-input"
  - text: Send button selector (CSS)
  - textbox "Send button selector (CSS)":
    - /placeholder: button[data-testid='send-button']
    - text: "#send-btn"
  - button "Cancel"
  - button "Save"
- text: Pretzel© 2026 · DLP for the AI era
- link "mykka.ai":
  - /url: https://mykka.ai
- text: Failed to fetch
```

```
Error: apiRequestContext.delete: connect ECONNREFUSED ::1:3000
Call log:
  - → DELETE http://localhost:3000/v1/site-configs/e2e-test-site.internal
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - Authorization: Bearer ps_adm_e2etenant_TgqODf96BiUalf1cHAd2gtKvNMiq5maS
    - cookie: __clerk_db_jwt_J0zl3Fkq=dvb_3EaMuEjUcSkxrACmPDH33QDmR21; __clerk_db_jwt=dvb_3EaMuEjUcSkxrACmPDH33QDmR21; clerk_active_context=sess_3EaMudg0sj5uUyYE4PV3FV6MCDH:org_3E4NtFEFGda9cWHoeLcwuanK5dU; __session=eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDExMUFBQSIsImtpZCI6Imluc18zRHJRc0xLNGlScExkZ0RobHVpZXA0dUtuVVUiLCJvaWF0IjoxNzgwNDEyNDUxLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwOi8vbG9jYWxob3N0OjUxNzMiLCJleHAiOjE3ODA0MTI1MTEsImZ2YSI6WzAsLTFdLCJpYXQiOjE3ODA0MTI0NTEsImlzcyI6Imh0dHBzOi8vcGxlYXNlZC1jbGFtLTI1LmNsZXJrLmFjY291bnRzLmRldiIsImp0aSI6IjhhNzUwYWNjZTY5M2M1MjZlMDE5IiwibmJmIjoxNzgwNDEyNDQxLCJvIjp7ImlkIjoib3JnXzNFNE50RkVGR2RhOWNXSG9lTGN3dWFuSzVkVSIsInJvbCI6ImFkbWluIiwic2xnIjoidGVzdC1zLW9yZ2FuaXphdGlvbi0xNzc5NDM0MDk0NzQ4MzY2ODAwIn0sIm9yZ19pZCI6Im9yZ18zRTROdEZFRkdkYTljV0hvZUxjd3Vhbks1ZFUiLCJvcmdfcm9sZSI6Im9yZzphZG1pbiIsInNpZCI6InNlc3NfM0VhTXVkZzBzajV1VXlZRTRQVjNGVjZNQ0RIIiwic3RzIjoiYWN0aXZlIiwic3ViIjoidXNlcl8zRTRPMWE4M3BjMEp2UzdBS0JHZlJ6Rm8yRVoiLCJ2IjoyfQ.Urm3MoahlwXpmQeQrzCy-m8UowXWMlzc2noR8UaEI8biJqbKE2shaCGG-MD18-k4NcppDunnv0wkQBG-pDfqUvBZFxBWZnpxAzqu8AACmasiuaDjqJRKJzynJMVGcENA3pc0JBVFn3EgDjpxMKay-Uc5Jjo57MokL9fQF4_jTKqMHJCiwurnk4_I2MjePFhLdGM8zT6DpQHOiwJf1Vy4pBbpBXTiKoNtVGSBWVxoBei0FBrFhtSP6wh0pr7fI_cwRxxrqF2-5hl1Kjey-Tsh1EIcqT_K28Kfm0trAcOzzVIsTQ1B08VeF1YvWYDzSQWBbzHEG_iCo7CN0bNjglZvNQ; __session_J0zl3Fkq=eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDExMUFBQSIsImtpZCI6Imluc18zRHJRc0xLNGlScExkZ0RobHVpZXA0dUtuVVUiLCJvaWF0IjoxNzgwNDEyNDUxLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwOi8vbG9jYWxob3N0OjUxNzMiLCJleHAiOjE3ODA0MTI1MTEsImZ2YSI6WzAsLTFdLCJpYXQiOjE3ODA0MTI0NTEsImlzcyI6Imh0dHBzOi8vcGxlYXNlZC1jbGFtLTI1LmNsZXJrLmFjY291bnRzLmRldiIsImp0aSI6IjhhNzUwYWNjZTY5M2M1MjZlMDE5IiwibmJmIjoxNzgwNDEyNDQxLCJvIjp7ImlkIjoib3JnXzNFNE50RkVGR2RhOWNXSG9lTGN3dWFuSzVkVSIsInJvbCI6ImFkbWluIiwic2xnIjoidGVzdC1zLW9yZ2FuaXphdGlvbi0xNzc5NDM0MDk0NzQ4MzY2ODAwIn0sIm9yZ19pZCI6Im9yZ18zRTROdEZFRkdkYTljV0hvZUxjd3Vhbks1ZFUiLCJvcmdfcm9sZSI6Im9yZzphZG1pbiIsInNpZCI6InNlc3NfM0VhTXVkZzBzajV1VXlZRTRQVjNGVjZNQ0RIIiwic3RzIjoiYWN0aXZlIiwic3ViIjoidXNlcl8zRTRPMWE4M3BjMEp2UzdBS0JHZlJ6Rm8yRVoiLCJ2IjoyfQ.Urm3MoahlwXpmQeQrzCy-m8UowXWMlzc2noR8UaEI8biJqbKE2shaCGG-MD18-k4NcppDunnv0wkQBG-pDfqUvBZFxBWZnpxAzqu8AACmasiuaDjqJRKJzynJMVGcENA3pc0JBVFn3EgDjpxMKay-Uc5Jjo57MokL9fQF4_jTKqMHJCiwurnk4_I2MjePFhLdGM8zT6DpQHOiwJf1Vy4pBbpBXTiKoNtVGSBWVxoBei0FBrFhtSP6wh0pr7fI_cwRxxrqF2-5hl1Kjey-Tsh1EIcqT_K28Kfm0trAcOzzVIsTQ1B08VeF1YvWYDzSQWBbzHEG_iCo7CN0bNjglZvNQ; __client_uat_J0zl3Fkq=1780412450; __client_uat=1780412450

```