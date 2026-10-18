You are working unattended in the domain-modeler repository. Implement exactly one ish: `{{ISH_ID}}`. Nobody can answer questions mid-run, so decide sensibly, follow the brief, and leave a record.

## Start

1. `ish update {{ISH_ID}} --status in-progress` before changing anything.
2. Read the brief with `ish show {{ISH_ID}}`. If it names a parent epic, read that too (`ish show <parent>`). The brief is the spec, and its **Verification** section is the acceptance criteria.
3. Read `ARCHITECTURE.md` and the code the brief points to before editing. `git log --oneline -10` shows what earlier parts already landed; notes appended to earlier ishes (`ish list --all --tag model-redesign`, then `ish show <id>`) can save you time.

## Work

- Implement everything in the brief, and nothing from the epic's "Deferred" list. Don't start other ishes.
- Match the surrounding code style. For Effect v4 APIs, read the types in `node_modules/effect` rather than relying on memory.
- Keep `ARCHITECTURE.md` and `.agents/skills/verify-domain-modeler/` current in the same change, as the brief says.

## Finish (the work is done only when all of these hold)

1. `pnpm check` exits 0. Use `pnpm format` for formatting failures.
2. Every grep and every UI step in the brief's Verification section passes. Do the UI steps with the verify-domain-modeler skill (`.agents/skills/verify-domain-modeler/SKILL.md`): drive the real user path, save evidence, make sure `ab errors` is empty, and always run `cleanup`, even after a failure.
3. Append a `## Implementation notes` section to the ish (`ish update {{ISH_ID}} --body-append -`) covering: what changed, any decision you made where the brief left room, the evidence path (`.verify/<run>/evidence/...`), and anything the next part should know.
4. Commit all changed, non-ignored files directly on `main` with one conventional commit message. Don't push. `.ish/` is git-excluded on purpose, so don't try to commit it.
5. `ish update {{ISH_ID}} --status completed`.

## If you can't finish

If a verification step can't pass, or the brief contradicts the code in a way you can't resolve safely, don't mark the ish completed. Leave it `in-progress`, append a `## Blocker` section to the ish with what you tried, the exact failing command and its output, and what a human needs to decide. Commit only work that leaves `pnpm check` green; otherwise leave it uncommitted. Then stop. The loop halts when an ish isn't completed.
