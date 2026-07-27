# Windows, WSL and tool placement

| Surface | Responsibilities |
|---|---|
| Windows | LM Studio, Hermes profile, Docker Desktop, XAMPP, Android Studio, Node dashboard |
| WSL2 Ubuntu | Git/Python/build utilities, isolated shell workflows, Windows workspace mount |
| Docker | Future risky/test workloads and isolated databases |
| LM Studio | Loopback inference only |
| Android Studio | Existing Windows Android projects; unchanged |

The workspace is shared at
`C:\AI-Workspace\local-ai-orchestrator` and
`/mnt/c/AI-Workspace/local-ai-orchestrator`.

Do not store active repositories in `/mnt/c` when Linux filesystem performance
becomes material; onboard a future project deliberately and record the chosen
canonical path.
