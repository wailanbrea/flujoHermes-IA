# Android quality-gate example

Adapt the snippet to the authorized project's existing plugins and tasks. Do not
apply it to a real Gradle build without review.

The aggregate task must depend on existing ktlint, detekt, Android Lint, unit,
Compose/connected, migration, and assemble tasks as appropriate. Missing tools
are reported, not silently substituted.
