Hi Neon, I’ve published my Week 4 report here:

https://github.com/tydeptrai21042004/CKBuilder/blob/main/reports/week-04-report.md

This week, I focused on turning CKBuilder from a credential proof demo into a more complete local application that can be tested end to end. I expanded the public interface into a CKBuilder Passport workflow with credential inspection, builder passports, evidence submission, a 14-module learning hub, optional BYOK AI, and HTML/document evidence support.

I also completed a zero-to-full WSL validation of the local stack. The self-healing launcher prepared the missing environment/support files, initialized the local issuer, started the public application and private issuer portal, connected to local OffCKB, and finished with the project reporting that all CKBuilder v5 local checks passed. The v5 release validation records 215 Node.js regression tests in total: 214 passed, 0 failed, and 1 optional CCC integration test skipped because that dependency was unavailable in the validation environment.

For the AI workflow, CKBuilder does not require a server-side API key. Users can optionally enter their own OpenAI, OpenRouter, Groq, or Gemini key for the current browser session. AI is limited to reading/explaining evidence and cannot approve, sign, issue, revoke, or override deterministic credential/CKB verification.

I also helped test Fiber Atlas locally using synthetic CKB transactions. The core close/settlement/penalty classification worked. I found two data-consistency issues: `/faultline/unresolved` can include already-spent but unclassified cells, and duplicate unattributed events can be stored. I recommended filtering unresolved cells with `spend_tx_hash IS NULL` and using a stable non-null identifier such as `commitment_outpoint` for event deduplication.

I would appreciate your feedback on which direction would be most useful to DevRel or other CKBuilders next: improving the Passport/evidence workflow for real community credentials, extending the learning modules, adding more public Testnet deployment evidence, or continuing compatibility/correctness testing of other ecosystem tools.

Thank you!
