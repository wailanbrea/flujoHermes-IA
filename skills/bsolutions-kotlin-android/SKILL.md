---
name: bsolutions-kotlin-android
description: Implement and review Kotlin/Android changes while preserving the app architecture, lifecycle, state model, nullability, offline behavior, Gradle wrapper, and quality gates. Use for Jetpack Compose, ViewModel, StateFlow, coroutines, Navigation, Room, Retrofit, Hilt or existing DI, WorkManager, DataStore, unit tests, Compose tests, MockWebServer, ktlint, detekt, Android Lint, or builds.
---

# Kotlin and Android workflow

## Required inputs

Require one objective, authorized module/path, Android/Gradle/Kotlin versions,
architecture, acceptance criteria, test commands, and protected files. Do not
modify a real app without explicit authorization.

## Process

1. Read `AGENTS.md`, wrapper/version catalogs, module build files, manifest,
   nearby state/UI/data code, and tests. Use the Gradle Wrapper only.
2. Preserve the existing architecture and DI. Separate UI, immutable state,
   events, business logic, and infrastructure.
3. Keep heavy work out of composables. Hoist state; use stable keys, lifecycle-
   aware collection, and deliberate effects to prevent unnecessary recomposition.
4. Use structured concurrency. Never block the main thread; handle cancellation,
   retries, timeouts, loading, empty, error, and recovery states.
5. Model nullability explicitly. Avoid `!!`, global scopes, leaked contexts,
   mutable public state, and fire-and-forget writes.
6. Validate Room migrations, transactions, indices, and offline conflict rules.
   Use WorkManager only for deferrable guaranteed work.
7. For money, use `BigDecimal`, minor units, or the existing validated money
   abstraction with explicit scale and rounding.
8. Test reducers/ViewModels, Flow ordering with Turbine when present, API
   failures with MockWebServer, Room migrations, and critical Compose behavior.
9. Run applicable project tasks: `ktlintCheck`, `detekt`, `lint`, unit tests,
   connected/Compose tests when configured, and `assembleDebug`.
10. Review the diff for lifecycle, performance, accessibility, navigation,
    compatibility, and generated-file changes.

## Exit and report

Report modules/files, state and architecture impact, commands/results, device or
emulator coverage, risks, and rollback. Stop after three reasoned attempts and
write a blocker; never weaken lint, tests, nullability, or Gradle checks.
