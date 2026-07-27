# Project onboarding

## Graph-first entry

When the user assigns work on an exact project, that instruction authorizes
read-only structural indexing of that project. It does not authorize code changes,
secret access, database access, deployments, or infrastructure changes.

Before raw file discovery:

```powershell
.\scripts\windows\ensure-project-graph.ps1 `
  -ProjectPath <exact-project-root> `
  -Question "<short task-derived question>"
```

The command performs one bounded flow:

1. Resolve only the supplied directory or its Git root.
2. Check the existing workspace, local cache, and global Graphify registry.
3. Reuse an existing graph without rescanning the corpus.
4. If missing, detect the supported corpus and skip sensitive files.
5. Refuse automatic onboarding above 500 files or two million words.
6. Build an AST-only graph in the local Graphify cache.
7. Register the graph globally.
8. Run one bounded graph query before raw search.

Projects with the same folder name are distinguished by the exact root marker and
a stable path fingerprint; an existing global tag is never overwritten blindly.

No semantic model or external API is used during automatic onboarding.

## Implementation workflow

1. Use the returned subgraph to identify exact files and relationships.
2. Read only the files needed to implement or verify the task.
3. Confirm modification authorization independently from graph registration.
4. Audit stack, tests, Git state and protected paths.
5. Create a narrow task contract and checkpoint when the project requires changes.
6. Run the baseline quality gate.
7. Implement one cohesive change and validate it.
8. Refresh the graph before handoff:

```powershell
.\scripts\windows\ensure-project-graph.ps1 `
  -ProjectPath <exact-project-root> `
  -Question "<what changed and what depends on it?>" `
  -Refresh
```

Projects under `C:\xampp\php\www` and `C:\xampp\htdocs` may be indexed when a user
task targets them, but they remain unauthorized for modification until the task
explicitly requests a code change.
