# Dev update threading verification

Inspected the supplied `wf_dev_updates_push_teams_channel.json` export, the v27 ProjectUpdates UI implementation, `postProjectUpdate.js`, and the supplied `qNewProjectUpdate.sql`. This is a static review and a mocked handler regression test; no live posts, Teams messages or database changes were executed.

## Normal posting behavior

1. The v27 composer submits the Dev tag as `teams_dev_channel`. Clicking Post Update submits a new-update request; the UI does not need to find the parent.
2. `qNewProjectUpdate.sql` searches the same workstream for an undeleted Dev row with `update_type = 'general'`, ordered by oldest `created_at`, then ID.
3. If no such row exists, it inserts `update_type = 'general'`, `parent_update_id = NULL`.
4. If one exists, it inserts `update_type = 'reply'`, `parent_update_id = existing_dev_root.id`, even though the author used the main composer rather than a Reply button.
5. `postProjectUpdate.js` reads `update_type` and `parent_update_id` from the returned database row when invoking `qSendUpdateToTeamsDev`. It does not override them with the main composer's request kind or null parent.
6. The UI groups rows using `parent_update_id`, so those later posts appear beneath the Dev parent when both the root and reply queries supply the rows.

## Exported Teams workflow

- `parentUpdateBranch` checks the provided `parentUpdateId`.
- `qParentUpdate` loads the exact parent row by that ID, including `source_update_id` and `source_channel_id`.
- `mfMessageType`, `smMessageType`, and `sbMessageType` route `updateType = 'reply'` plus a non-null parent to the thread-reply blocks. A general row with no parent goes to the channel-message blocks.
- `postThreadReplyMF` posts to `/messages/{{ qParentUpdate.data?.[0]?.source_update_id }}/replies`, using the parent channel or the configured default. Equivalent reply blocks exist for SM/SB.
- `qInsertTeamIdDedupe` persists the sent message's `source_update_id`. It does not change `parent_update_id` or `update_type`.

The workflow routes the already-classified update. It does not search for an existing Dev root, reclassify general rows as replies, merge duplicate parents, or enforce a single parent. A reply also needs its parent to have a valid Teams `source_update_id`; otherwise the reply endpoint cannot target that parent message.

## Scope of the single-parent behavior

Sequential posts through the agreed current query wiring reuse one parent **per workstream**. Existing duplicate parents are not merged: the query selects the oldest general Dev row for future replies. The query itself does not enforce a uniqueness invariant. Two concurrent first posts can both observe no root and insert different parent IDs. Request-ID idempotency prevents duplicate rows from retrying the same request, not from two distinct simultaneous requests.

A strict guarantee requires a database uniqueness rule aligned with the chosen definition of a Dev parent, plus conflict/retry handling that re-reads the winning root. No schema constraint was inspected or added in this audit; an existing database constraint could already prevent duplicate parents, but that cannot be established from the supplied query or workflow export alone.
