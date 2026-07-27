# Laravel quality-gate example

Copy only the relevant script keys into an authorized Laravel project's
`composer.json`; do not install packages blindly.

`composer quality` should run formatting check, static analysis, unit/feature
tests, dependency audit, and an optional project-defined E2E command. Each
command must already exist in that project.
