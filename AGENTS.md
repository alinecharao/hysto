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
- Deleting a chat message also deletes every later turn; regenerating removes the selected assistant turn and later turns, then streams a replacement without persisting the user prompt twice.
- Preset characters have `user_id NULL` (readable by all signed-in users); user characters are owner-only via RLS.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate redirecting to `/auth`).
- `/` redirects to `/auth`; successful authentication opens `/dashboard`, the canonical catalog of all stories.
