# Judge v2 data and model licenses

Licenses are taken from each Hugging Face card's declared license (checked 2026-10-14). The product owner confirms commercial use before Stage 1 training starts.

## Stage 1 training data (NLI)

| Source | License on card | Use | Link |
|---|---|---|---|
| `nyu-mll/multi_nli` (MNLI) | cc-by-3.0, cc-by-sa-3.0, mit, other (OANC-based; one fiction source CC BY-SA 3.0) | English NLI pairs, then translated | https://huggingface.co/datasets/nyu-mll/multi_nli |
| `stanfordnlp/snli` (SNLI) | cc-by-sa-4.0 | English NLI pairs, then translated | https://huggingface.co/datasets/stanfordnlp/snli |
| `alisawuffles/WANLI` | cc-by-4.0 | English NLI pairs, then translated | https://huggingface.co/datasets/alisawuffles/WANLI |

**Share-alike note:** the CC BY-SA sources allow commercial use, including training. If the translated datasets themselves are ever *published* (for example in a public GitHub release), they must carry CC BY-SA with attribution. Training a model on them and shipping the model is the intended use.

## Translation models (run locally, used only to translate Stage 1 data)

| Model | License on card |
|---|---|
| `Helsinki-NLP/opus-mt-en-he` | apache-2.0 |
| `Helsinki-NLP/opus-mt-en-es` | apache-2.0 |
| `Helsinki-NLP/opus-mt-en-fr` | apache-2.0 |
| `Helsinki-NLP/opus-mt-en-de` | cc-by-4.0 |
| `Helsinki-NLP/opus-mt-tc-big-en-pt` | cc-by-4.0 |
| `Helsinki-NLP/opus-mt-en-ru` | apache-2.0 |
| `Helsinki-NLP/opus-mt-en-ar` | apache-2.0 |
| `Helsinki-NLP/opus-mt-en-zh` | apache-2.0 |

## Base model (shipped as a derivative)

| Model | License | Obligation when shipping |
|---|---|---|
| `google/gemma-3-270m` | Gemma Terms of Use | Free for commercial use. Include a notice that the model is based on Gemma and subject to its terms, and pass Google's prohibited-use policy on to users (for example via the product terms). Reviewed by the owner before release (Spec 2). |

## Other data sources

- **Faker** (MIT): generates fake names, IDs, cards and addresses for scripted messages. No real personal data.
- **Claude Code subagents:** write synthetic messages and labels in-session. No customer data.
- **wordfreq** (code Apache-2.0; word lists from sources listed in its README): used only to decide which vocabulary tokens to keep.

## Excluded

| Item | Why |
|---|---|
| XNLI, ANLI | cc-by-nc-4.0 (non-commercial) |
| FEVER-NLI (`pietrolesci/nli_fever`), `MoritzLaurer/multilingual-NLI-26lang-2mil7` | no license declared on the card |
| Baseline A `MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7` | MIT itself, but trained partly on cc-by-nc data. Used only as an internal comparison; never shipped. |
