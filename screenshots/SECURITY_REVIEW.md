# Screenshot Security Review

The screenshots in this directory were reviewed before inclusion.

## Checked for sensitive information

- issuer private-key values or PEM private-key blocks;
- seed phrases or wallet mnemonics;
- passwords, access tokens, API keys, or session cookies;
- `.env` contents;
- raw student identifiers or identity salts;
- production wallet or mainnet account information.

**Result:** none of those values appears in the screenshots.

## Redaction and processing

- all Week 2 execution images were re-encoded as PNG files;
- the local Windows/WSL account path in `05-local-offckb-lifecycle-success.png` was replaced with `<PROJECT_ROOT>`;
- `07-v2.2-dashboard.png` and `08-v2.2-learning-hub.png` are local UI previews containing only public labels and aggregate learning counts;
- no technical pass/fail result, checksum, transaction hash, credential hash, code hash, or local-devnet address was changed.

## Values intentionally retained

The following values are retained as local-devnet technical evidence:

- OffCKB development address;
- issuer Lock Script hash;
- credential hash;
- local transaction hashes;
- contract code hash and checksum;
- test names and pass/fail output;
- loopback RPC and inspector addresses.

These values belong only to local OffCKB development networks. The associated prefunded development accounts must never be used with real assets.


## Week 3 learning screenshots

The three Week 3 terminal screenshots were reviewed before publication:

- `week-03/01-learning-quiz-catalog.png`;
- `week-03/02-ckb-foundations-diagnostic-quiz.png`;
- `week-03/03-learning-progress-check.png`.

The original prompt line in the first and third screenshots exposed a local Linux username and Windows download path. That line was replaced with a neutral `PROJECT>` prompt. The commands, module names, quiz output, progress counts, and validation results were not changed. The second image contained no private key, seed phrase, token, `.env` value, wallet secret, or transaction-signing material.
