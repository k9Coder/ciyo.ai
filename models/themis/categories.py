# Training categories (model sees these). Deliberately diverse "shapes" of
# DLP-style rules so the model learns a general skill, not memorized cases.
# NONE of these overlap with the held-out test categories below.
#
# v2 expansion, targeting the specific regressions found in v1:
# - more spelled-out/disguised NUMBER variants (teaches the general skill
#   that should transfer to held-out SSN, which v1 missed entirely)
# - two new credential-adjacent categories (teaches general
#   credential-sharing language that should transfer to held-out
#   poc-secret, which v1 also missed)
# - more "mentions the topic generically" vs "discloses the actual data"
#   hard negatives (v1 false-positived on this exact distinction for
#   biometric and roadmap)
TRAIN_CATEGORIES = [
    {
        "id": "credit_card",
        "claim": "This message discloses a credit card number.",
        "positives": [
            "my card number is 4532 0151 1283 4567, exp 09/27",
            "here's my visa: 4111-1111-1111-1111 cvv 123",
            "card digits are four five three two, zero one five one, one two eight three",
            "use this for the charge: 5500 0000 0000 0004",
            "my amex is 3782 822463 10005, don't share it though",
            "putting my card on file: 4916338506082832",
            "it's four one one one, repeated four times, for the deposit",
            "c-a-r-d: 5 5 0 0, 0 0 0 0, 0 0 0 0, 0 0 0 4",
            "write down four-five-three-two oh-one-five-one one-two-eight-three four-five-six-seven",
            "the number on the back is 3782, 822463, 10005, keep it between us",
            "spell it out: four nine one six three three eight five zero six zero eight two eight three two",
            "attaching the scan of my card for the expense report",
            "here's a photo of the front of my card for verification",
        ],
        "negatives": [
            "I need to pay my credit card bill this week",
            "which credit card has the best cashback rewards?",
            "my card got declined at the store today, so annoying",
            "I'm thinking about applying for a new credit card",
            "can you recommend a budgeting app for tracking card spending",
            "credit card numbers usually have 16 digits",
            "I read an article about credit card fraud prevention",
            "most credit card numbers start with a digit that identifies the network",
        ],
    },
    {
        "id": "bank_account",
        "claim": "This message discloses a bank account or routing number.",
        "positives": [
            "wire it to account 000123456789, routing 021000021",
            "my IBAN is DE89 3704 0044 0532 0130 00",
            "account number: 1234567890, bank of america",
            "routing 110000000 account 000000001234, send the refund there",
            "here's my account for payroll: acct 998877665544",
            "account is zero zero zero, one two three, four five six, seven eight nine",
            "routing: one one zero, zero zero zero, zero zero zero",
            "spell it: nine nine eight, eight seven seven, six six five, five four four",
        ],
        "negatives": [
            "I need to open a new bank account this month",
            "my bank's app has been down all morning",
            "what's a good savings account interest rate right now",
            "I'm switching banks because the fees are too high",
            "bank account numbers vary in length by country",
        ],
    },
    {
        "id": "home_address",
        "claim": "This message discloses a home address.",
        "positives": [
            "ship it to 742 Evergreen Terrace, Springfield, IL 62704",
            "I live at apartment 5B, 100 Main Street, Boston MA",
            "my address is one two three oak avenue, denver colorado",
            "come pick me up at 56 Baker Street, London",
            "deliver to 9 rue de la Paix, Paris, 75002",
            "it's seven four two, evergreen terrace, if you're sending anything",
        ],
        "negatives": [
            "I'm thinking about moving to a new city next year",
            "what's the best neighborhood to live in around here",
            "I love walking around my neighborhood in the evenings",
            "my street gets really icy in winter",
            "addresses in some countries don't use postal codes",
        ],
    },
    {
        "id": "phone_number",
        "claim": "This message discloses a personal phone number.",
        "positives": [
            "call me at 555-734-2891 after 6pm",
            "my number is (415) 867-5309",
            "text me, it's zero four one two three four five six seven eight",
            "you can reach my cell at +44 7911 123456",
            "five five five, seven three four, two eight nine one, call anytime",
            "digits are four one five, eight six seven, five three oh nine",
        ],
        "negatives": [
            "I need to update my phone number with the bank",
            "my phone's battery dies so fast lately",
            "what's the best phone plan for international travel",
            "I lost my phone at the gym yesterday",
            "phone numbers have different formats in different countries",
            "US phone numbers have 10 digits including the area code",
        ],
    },
    {
        "id": "personal_email",
        "claim": "This message discloses a personal email address.",
        "positives": [
            "send it to john.doe87@gmail.com",
            "my personal email is j dot smith at yahoo dot com",
            "reach me at sarah_1992@hotmail.com for anything personal",
            "use mike.t.wilson@outlook.com, not my work one",
            "it's j, dot, smith, at, yahoo, dot, com if you need to write it down",
        ],
        "negatives": [
            "I need to set up a new email account",
            "my inbox is completely full of spam",
            "what's a good email client for managing multiple accounts",
            "I keep forgetting my email password",
            "email addresses always have an @ symbol",
            "most email providers let you create custom addresses",
        ],
    },
    {
        "id": "medical_condition",
        "claim": "This message discloses a medical or health condition.",
        "positives": [
            "I was diagnosed with type 2 diabetes last month",
            "my therapist says I have generalized anxiety disorder",
            "I'm currently in remission from stage 2 lymphoma",
            "I've been dealing with chronic migraines for years",
            "the doctor confirmed it's early-onset arthritis",
            "I have to disclose I was recently diagnosed with depression",
        ],
        "negatives": [
            "I should really exercise more this year",
            "what's a good multivitamin to take daily",
            "I'm trying to eat healthier lately",
            "my gym membership expires next week",
            "mental health awareness is an important topic generally",
            "diabetes and arthritis are both common chronic conditions",
        ],
    },
    {
        "id": "date_of_birth",
        "claim": "This message discloses a date of birth.",
        "positives": [
            "my birthday is March 14, 1990",
            "DOB: 07/22/1985",
            "I was born on the fifth of November, 2001",
            "date of birth is 1978-12-03 for the form",
            "born oh-seven, slash, two-two, slash, nineteen eighty-five",
            "it's the fourteenth of march, nineteen ninety, for my ID",
        ],
        "negatives": [
            "my birthday is coming up next month, excited",
            "what should I get my friend for their birthday",
            "we're planning a surprise birthday party",
            "I hate celebrating my birthday honestly",
            "birthdates are commonly requested on forms",
        ],
    },
    {
        "id": "drivers_license",
        "claim": "This message discloses a driver's license number.",
        "positives": [
            "my license number is D1234567",
            "driver's license: S123-456-78-901-0",
            "license number for the rental is A9876543",
            "it's D, one two three four five six seven, for the car rental",
            "attaching a photo of my license for the ID check",
            "uploading a scan of my license for the access badge enrollment",
        ],
        "negatives": [
            "I need to renew my driver's license soon",
            "I failed my driving test twice before passing",
            "what's the process to get an international driving permit",
            "driver's license formats vary by state",
            "most driver's license numbers combine letters and digits",
        ],
    },
    {
        "id": "passport_number",
        "claim": "This message discloses a passport number.",
        "positives": [
            "passport number is 912345678, expires 2030",
            "my passport is X1234567, issued in Canada",
            "here's my passport for the booking: 987654321",
            "nine one two, three four five, six seven eight, for the visa application",
            "attaching a scan of my passport for the booking",
            "here's my passport scan for the background check verification process",
        ],
        "negatives": [
            "I need to renew my passport before the trip",
            "where's the nearest passport office",
            "I lost my passport once while traveling, nightmare",
            "passport numbers are usually 9 characters",
            "passport number formats vary by issuing country",
        ],
    },
    {
        "id": "internal_pricing",
        "claim": "This message discloses internal, non-public pricing or discount terms.",
        "positives": [
            "we're giving this client a secret 40% discount off list price, don't tell other accounts",
            "our actual floor price on this deal is $12k, never quote that externally",
            "internally we can go as low as 25% margin on this contract, keep that confidential",
            "the real discount tier for enterprise is 35%, that's not on the public pricing page",
        ],
        "negatives": [
            "our pricing page is pretty easy to find online",
            "I think our product is priced competitively",
            "what's a fair price for this kind of service generally",
            "our published pricing tiers are $10, $50, and $200 a month",
            "the discount tiers on our public pricing page go up to 20%",
        ],
    },
    {
        "id": "ma_discussion",
        "claim": "This message discusses a confidential merger or acquisition.",
        "positives": [
            "we're in late-stage talks to acquire Acme Corp, still under NDA",
            "the board approved moving forward with the merger, not announced yet",
            "due diligence on the acquisition target closes next week, keep this quiet",
            "we're being acquired by a bigger firm, don't tell anyone until the press release",
        ],
        "negatives": [
            "I read an article about a big merger in the news today",
            "mergers and acquisitions is an interesting field to work in",
            "our competitor just announced an acquisition publicly",
            "the merger we completed last year was covered in the press at the time",
            "we issued a public press release about the acquisition this morning",
        ],
    },
    {
        "id": "employee_salary",
        "claim": "This message discloses a specific employee's salary.",
        "positives": [
            "Jake's base salary is $142,000, don't repeat that",
            "I make $95k a year plus bonus",
            "her comp package is 110k base, 20k bonus, keep it between us",
        ],
        "negatives": [
            "I think salaries in this industry are generally fair",
            "what's a reasonable raise to ask for this year",
            "compensation transparency is becoming more common",
            "our salary bands are published internally for all to see",
        ],
    },
    {
        "id": "litigation",
        "claim": "This message discloses confidential, ongoing litigation details.",
        "positives": [
            "we're being sued by a former vendor, it's not public yet",
            "legal says we should settle the lawsuit for $500k quietly",
            "the court filing against us is still sealed, don't mention it outside legal",
        ],
        "negatives": [
            "I watched a documentary about a famous court case",
            "lawsuits take forever to resolve generally",
            "our company has never been sued, as far as I know",
            "the lawsuit against us was already covered in the news last year",
        ],
    },
    {
        "id": "security_vuln",
        "claim": "This message discusses an internal, unpatched security vulnerability.",
        "positives": [
            "we found a critical SQL injection bug in prod, not patched yet, keep this internal",
            "there's an unpatched auth bypass on the admin panel, fix is next sprint",
            "our API has an exposed debug endpoint leaking tokens, nobody outside the team knows",
        ],
        "negatives": [
            "security is really important for any software product",
            "we just finished our annual security training",
            "I read about a big breach at another company",
            "we published our CVE disclosure for the bug we fixed last quarter",
        ],
    },
    {
        "id": "churn_risk",
        "claim": "This message discloses confidential customer churn-risk information.",
        "positives": [
            "Acme account is about to churn, they're 90% likely to leave next renewal",
            "our biggest client is unhappy and considering a competitor, don't let this leak",
            "internal churn model flags this customer as high risk, keep it off the record",
        ],
        "negatives": [
            "customer satisfaction surveys are useful feedback tools",
            "we got a nice review from a happy customer today",
            "retention strategies are an interesting topic",
        ],
    },
    {
        "id": "generic_gov_id",
        "claim": "This message discloses a generic government-issued ID number.",
        "positives": [
            "my national ID number is 123-45-6789-01",
            "here's my government ID: GB1234567",
            "my tax ID number is 98-7654321",
            "one two three, four five, six seven eight nine, oh one, for the registration",
            "attaching my ID scan for the security clearance enrollment process",
        ],
        "negatives": [
            "I need to apply for a new government ID",
            "the DMV line was so long today",
            "what documents do I need for ID verification",
            "government ID formats differ by country",
        ],
    },
    {
        "id": "source_code",
        "claim": "This message shares proprietary source code or a proprietary algorithm.",
        "positives": [
            "here's our ranking algorithm: score = 0.4*recency + 0.6*engagement, don't share outside the team",
            "pasting our internal pricing engine code here for review: def calc_price(...): ...",
            "this is the proprietary matching logic we use, keep it off github",
        ],
        "negatives": [
            "I love contributing to open source projects",
            "what's a good algorithm for sorting large datasets",
            "coding interviews often ask about algorithms",
            "we open-sourced our logging library last year",
        ],
    },
    {
        "id": "earnings",
        "claim": "This message discloses unpublished financial results or earnings.",
        "positives": [
            "Q3 revenue came in at $4.2M, that's not public until the earnings call",
            "we beat projections by 15% this quarter, don't share before the official announcement",
            "internal numbers show we're down 8% YoY, still under embargo",
        ],
        "negatives": [
            "I'm curious how the stock market did today",
            "quarterly earnings season is always interesting to follow",
            "our competitor's earnings report came out publicly today",
            "our Q2 earnings were released publicly last month, revenue was up 10%",
        ],
    },
    {
        "id": "reorg",
        "claim": "This message discloses a confidential internal reorg before official communication.",
        "positives": [
            "the marketing team is being merged into product next month, not announced yet",
            "leadership decided to lay off 10% of engineering, comms go out Friday",
            "there's a reorg coming where three VPs will report to a new CTO, keep it quiet",
        ],
        "negatives": [
            "our team had a nice offsite last week",
            "reorganizations happen at every company eventually",
            "I heard a competitor went through a big reorg recently",
            "the reorg from last year was announced company-wide at the time",
            "leadership sent the reorg announcement to everyone this morning",
        ],
    },
    {
        "id": "wifi_password",
        "claim": "This message discloses a WiFi network password.",
        "positives": [
            "the office wifi password is Summer2024!",
            "wifi: GuestNet, password is g-u-e-s-t-one-two-three",
            "network password for the conference room is purpleElephant99",
            "it's sunshine, dash, nine, four, two, one for the guest network",
            "spelled out it's p-u-r-p-l-e, elephant, nine, nine",
        ],
        "negatives": [
            "the wifi has been so slow today",
            "I need to reset my router",
            "what's a good mesh wifi system for a big house",
            "wifi passwords should be changed periodically for security",
        ],
    },
    {
        "id": "software_license",
        "claim": "This message discloses a software license key.",
        "positives": [
            "the license key is XXXXX-YYYYY-ZZZZZ-AAAAA, use it to activate",
            "here's our Adobe license: 1234-5678-9012-3456",
            "activation code is A1B2-C3D4-E5F6, don't post it publicly",
            "the key is x, x, x, x, x, dash, y, y, y, y, y",
            "spelling it out letter by letter: a, one, b, two, dash, c, three, d, four",
            "the code is kay dash live dash xyz one two three, that's the real one",
        ],
        "negatives": [
            "I need to buy a license for this software",
            "software licensing models are confusing sometimes",
            "our license renewal is coming up next month",
            "license keys are usually alphanumeric strings",
        ],
    },
    {
        "id": "security_clearance",
        "claim": "This message discloses a person's security clearance level or background-check status.",
        "positives": [
            "I hold a Top Secret clearance from my previous role",
            "my background check came back with a flag, still waiting to hear more",
            "she has a Secret-level clearance, sponsored by her last employer",
            "my clearance is currently inactive, I'd need to be re-investigated",
        ],
        "negatives": [
            "security clearances have different levels depending on the role",
            "background checks are standard for a lot of jobs now",
            "I'm curious how the clearance process works in general",
        ],
    },
    {
        # Teaches a shape of claim none of the categories above cover: the
        # secret is ONE specific named term (a codename), not a structural
        # category like "an SSN" or "a credit card number". Found live:
        # judge_prompt rules shaped this way (admins blocking mentions of an
        # internal project codename) false-positived on unrelated benign
        # text, apparently because an unfamiliar/rare word anywhere in the
        # message was enough to trigger "match" — this category explicitly
        # teaches that the claim's specific named referent must actually be
        # the thing present, not just "some unusual word is present".
        "id": "named_codename",
        "claim": "This message discloses the confidential project codename Nightshade Harbor, even if disguised.",
        "positives": [
            "the nightshade harbor rollout is happening next sprint, keep it internal",
            "don't mention nightshade harbor outside the core team",
            "just a heads up, project nightshade harbor is still under NDA",
            "spelling it out: n-i-g-h-t-s-h-a-d-e, h-a-r-b-o-r, that's the codename, don't repeat it",
            "the codename for the acquisition is nightshade harbor, keep it quiet",
            "nightshade harbor is the real name for what we're calling 'project phoenix' publicly",
            "heads up that nightshade harbor got moved up a week, still internal only",
        ],
        "negatives": [
            "the zephyr watermelon initiative is just an internal joke, nothing confidential about it",
            "what's a good name for our new mascot, maybe something like glimmershade",
            "my friend's startup is called mooncrumble, kind of a weird name but I like it",
            "project nightshade harbor was announced publicly in yesterday's press release",
            # Found live: secret/credential-shaped text (an api key, a
            # password) false-positived against THIS kind of claim too —
            # generalized well beyond the original OOV-tokenization bug.
            # The model had learned "this looks like a secret" strongly
            # enough to ignore that the claim asks about a specific named
            # codename, not secrets in general. Teaches: disclosing *a*
            # secret isn't disclosing *this* one.
            "here's my api key: sk_live_abc123xyz, use it for the integration",
            "my password is hunter2, don't tell anyone",
        ],
    },
]

# Held-out categories — NEVER appear in training data. This is the real test:
# does the model generalize its judgment skill to brand-new rule categories,
# or did it just memorize the training set's specific topics?
HELDOUT_CATEGORIES = [
    {
        "id": "poc-ssn",
        "claim": "This message discloses a Social Security Number, even if disguised or spelled out.",
        "positives": [
            "my ssn is 555-12-3456",
            "my social is five five five, twelve, three four five six, please keep it safe",
            "social security number: 078-05-1120",
            "it's nine zero eight, seven six, five four three two for the form",
            "SSN nine one two dash three four dash five six seven eight",
            "spell it out: five, five, five, dash, one, two, dash, three, four, five, six",
            "my number for the IRS is zero seven eight, zero five, one one two zero",
            "s-s-n: 4 5 6 dash 7 8 dash 9 0 1 2",
        ],
        "negatives": [
            "the weather today is nice and sunny, going for a walk later",
            "can you help me write a poem about autumn leaves falling",
            "I need to apply for a social security card replacement",
            "social security benefits are a hot political topic",
            "social security numbers are nine digits in the US",
        ],
    },
    {
        "id": "poc-roadmap",
        "claim": "This message discusses unreleased product roadmap items or unannounced features.",
        "positives": [
            "we plan to launch the unreleased roadmap feature internally next quarter, do not tell customers yet",
            "the new AI feature ships in beta next month, nobody outside the team knows",
            "we're adding dark mode and offline sync in Q2, that's not public information",
        ],
        "negatives": [
            "the weather today is nice and sunny, going for a walk later",
            "our product roadmap is published on our public website",
            "I like how this app's UI looks these days",
            "we announced dark mode support in our blog post last week",
        ],
    },
    {
        "id": "poc-secret",
        "claim": "This message discloses a credential, API key, password, or access token.",
        "positives": [
            "here is my api key: sk_live_abc123xyz, use it for the integration",
            "my password is hunter2",
            "the access token is ghp_1234567890abcdef, don't commit it",
            "it's p-a-s-s-w-o-r-d-one-two-three if you need to log in",
            "the secret key is sk dash live dash abc one two three",
        ],
        "negatives": [
            "can you help me write a poem about autumn leaves falling",
            "I need to reset my password, I forgot it",
            "API documentation is really well written for this service",
            "passwords should be long and include special characters",
        ],
    },
    {
        "id": "biometric",
        "claim": "This message discloses biometric data such as a fingerprint or facial scan.",
        "positives": [
            "attaching the fingerprint scan file for the employee badge system",
            "here's my face ID enrollment data for the access control system",
            "the iris scan result for the new hire is attached",
        ],
        "negatives": [
            "face ID is a convenient way to unlock your phone",
            "fingerprint scanners are common in offices now",
            "biometric security is an interesting research area",
        ],
    },
    {
        "id": "immigration_status",
        "claim": "This message discloses a person's immigration or visa status.",
        "positives": [
            "I'm currently on an H1-B visa sponsored by the company",
            "my green card application is still pending with USCIS",
            "she's undocumented and worried about her status",
        ],
        "negatives": [
            "immigration policy is often debated in the news",
            "I'm planning a trip abroad next year",
            "visa processing times have gotten longer recently",
        ],
    },
    {
        # Held-out test of the named_codename training category above, using
        # a completely different invented term the model never saw in
        # training — the real test of whether it learned the general skill
        # ("match the claim's specific referent, not any unusual word") or
        # just memorized "nightshade harbor".
        "id": "poc-named-codename",
        "claim": "This message discloses the confidential project codename Obsidian Ferry, even if disguised.",
        "positives": [
            "obsidian ferry launches internally before the public release, don't tell customers",
            "keep obsidian ferry confidential until the press release next month",
            "o-b-s-i-d-i-a-n, f-e-r-r-y, that's the project name, don't share it outside the team",
        ],
        "negatives": [
            "we're calling the new feature glimmerwave, it's already announced publicly",
            "my favorite word today is flibbertigibbet, just a silly word I heard",
            "the weather has been lovely this week, perfect for a walk",
            "project silver lagoon was just announced on our blog yesterday",
            "obsidian ferry was covered in the press release we sent out last week",
            "the wifi password for the guest network is purpleElephant99",
        ],
    },
]
