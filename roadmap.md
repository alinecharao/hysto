# Automatic story memory

## Personal chat review
- [x] Make retries idempotent and preserve every message unless explicitly deleted.
- [x] Preserve unaffected memory after deletion; reduce redundant memory calls and context truncation.
- [x] Strengthen canonical names, chronology and character knowledge without changing saved conversations.
- [x] Verify 20 regression tests, load a 600-response story, and confirm live persistence, reload, failed regeneration preservation, cancellation saving and conflicting retry rejection using a temporary story.

- [x] Remove the four-batch interruption, preserve incremental progress and cancellation, and verify long-history regression tests — all 15 memory/fallback tests pass; build OK.

- [x] Restore cooldown-aware model fallback during memory updates; all 12 memory and fallback tests pass and build is OK.

- [x] Add private persistent memory with safe invalidation after manual deletion.
- [x] Build automatic history summarization and include memory in every provider's context.
- [x] Verify scoped reads, automatic incremental updates, deletion safety, and stale-write prevention with seven passing tests; confirm a live summary persists names and old events and deleting one temporary message invalidates only memory.
- [x] Complete live follow-up continuity verification — Elara/Kaelen relationship and library location preserved; new story response completed in approximately 8 seconds. Large unsummarized backlogs still require catch-up before replying.
## Empty memory response
- [x] Identify inconsistent Groq reasoning configuration between memory and replies; report finish reasons without private content. The exact upstream cause of the earlier empty response was not recorded and remains unconfirmed.
- [x] Share provider preparation, reject empty/refused/truncated records without overwriting saved memory, and verify 26 regressions plus a live HTTP 200 memory extraction preserving fictitious names; build OK.
