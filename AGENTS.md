<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture

- Chat streams via `src/routes/api/chat.ts` (server route, bearer-token auth); server loads history from `messages` and persists both turns — client sends only the new text.
- Message history is paginated client-side beyond the Data API's 1,000-row response limit; AI context reads the newest turns in descending order and reverses them before prompting.
- Story memory is persisted per user and character with exact source IDs and optimistic revisions; deletion invalidates derived memory only when the deleted ID was summarized, avoiding unnecessary reconstruction.
- All providers receive the same 16 recent messages; memory catch-up is skipped only while every unsummarized turn fits this verbatim window, reducing calls without context gaps.
- Browser-generated UUID message identities are reused for retries and streamed responses; user inserts are idempotent, aborts persist partial replies client-side, and requested regeneration replaces the old reply only after the new one is persisted, preventing silent loss.
- Memory catch-up processes the fixed history target to completion within the same send, saving each batch and respecting request cancellation; no batch-count cutoff asks the user to resend merely because a story is long.
- Memory extraction and chat share bounded, cooldown-aware model fallback only for 429 and transient 5xx responses; terminal denials never fall through, preventing memory limits from uniquely blocking recovery or bypassing provider restrictions.
- Memory and replies share provider request preparation; memory accepts only complete visible text, preserves prior progress on empty/truncated/refused output, and logs finish metadata without story content to diagnose failures safely.
- Deleting a chat message removes only that row; regenerate is offered only on the latest assistant turn, so no other message is ever deleted implicitly.
- Preset characters have `user_id NULL` (readable by all signed-in users); user characters are owner-only via RLS.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate redirecting to `/auth`).
- `/` redirects to `/auth`; successful authentication opens `/dashboard`, the canonical catalog of all stories.
