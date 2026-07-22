**Healthcare team uploads a patient export to "summarize the columns"**

A CISO at a healthcare company told me the scenario that keeps him up: an analyst uploads a CSV to an AI tool to get help writing a summary. Happened in his org — the file was a patient export. Names, DOBs, member IDs. About 30,000 rows.

mykka caught it on file upload, not just paste:

- **Data type:** PII — pattern rules for SSN/member-ID formats, fuzzy dictionary match against their own patient-identifier schema
- **Destination:** ChatGPT and every other AI tool in scope
- **Action:** block uploads containing PII; warn on small inline pastes so people can self-correct

One blocked upload paid for the deployment. The analyst wasn't malicious — she was efficient. Your policy has to assume good people doing fast work.
