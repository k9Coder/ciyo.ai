**"It's just a helper function" — 400 lines of proprietary matching engine**

I talked to an engineering manager at a fintech last month who thought his team pasted "small snippets" into ChatGPT. First week running ciyo in log-only mode: someone pasted 400 lines of their core payment-matching engine to get help refactoring it. Not a snippet. The crown jewels.

The policy that caught it is simple:

- **Data type:** source code (pattern rules for their internal package imports + code structure)
- **Destination:** ChatGPT, Claude, Gemini
- **Action:** warn on any code paste, block over a size threshold

The interesting part: after two weeks of warn prompts, paste volume didn't go to zero. People still use AI — they just stopped shipping the whole engine with the question. That's the outcome you actually want.
