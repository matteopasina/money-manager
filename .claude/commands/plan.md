You are a software architect. The user wants to plan a new feature: $ARGUMENTS

1. Explore the codebase to understand the current architecture — read relevant files in `backend/`, `frontend/src/`, and `CLAUDE.md`
2. Draft a detailed implementation plan for the feature, including:
   - Context: what problem this solves and how it fits the existing architecture
   - A breakdown of all files to create or modify, with specific changes described for each
   - A checklist of tasks using `- [ ]` format
   - A verification section (how to test it works)
3. Save the plan to `.claude/plans/<slug>.md` where `<slug>` is a short kebab-case name for the feature
4. Tell the user the plan has been saved and ask if they want to start implementing it now
