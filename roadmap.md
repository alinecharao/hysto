# Automatic story memory

- [x] Remove the four-batch interruption, preserve incremental progress and cancellation, and verify long-history regression tests — all 15 memory/fallback tests pass; build OK.

- [x] Restore cooldown-aware model fallback during memory updates; all 12 memory and fallback tests pass and build is OK.

- [x] Add private persistent memory with safe invalidation after manual deletion.
- [x] Build automatic history summarization and include memory in every provider's context.
- [x] Verify scoped reads, automatic incremental updates, deletion safety, and stale-write prevention with seven passing tests; confirm a live summary persists names and old events and deleting one temporary message invalidates only memory.
- [ ] Complete live follow-up continuity verification — blocked by the configured AI service's temporary rate limit (429).