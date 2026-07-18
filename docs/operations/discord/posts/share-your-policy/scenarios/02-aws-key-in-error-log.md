**Live AWS keys don't look like secrets when they're buried in a stack trace**

A platform team at a logistics company had a rule everyone "knew": never paste credentials into AI tools. Nobody thought they were breaking it. Then a developer pasted a full error log into Claude to debug a deploy failure — and the log contained a live AWS access key printed by a misconfigured startup script.

Their ciyo policy:

- **Data type:** credentials — pattern match on key formats (AWS, GitHub tokens, generic `key=` assignments) plus entropy rules for high-randomness strings
- **Destination:** all AI tools
- **Action:** block, no override

Blocked at paste time. The developer didn't even know the key was in there. That's the whole point — the person pasting is almost never the person who put the secret in the file.
