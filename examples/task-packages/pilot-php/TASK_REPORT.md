# PILOT-001 — Correct integer discount rounding

## Result: PASS

### Change

The initial implementation used `floor()`, which returned `0` for the half-up
boundary `subtotal=1, percent=50`. The calculation now uses `round()` with
`PHP_ROUND_HALF_UP`; validation behavior is unchanged.

### Validation

```text
PILOT_TESTS_OK
```

Independent command:

```text
C:\xampp\php\php.exe examples\task-packages\pilot-php\tests\run.php
```

Exit code: `0`.

### Agent execution note

The interactive Hermes run stayed within the pilot scope and produced the report,
but incorrectly described the already-applied fix as “no change required”.
Independent verification corrected this report. The missing profile setting was
then corrected and Hermes checkpoint creation/restoration was validated separately
with a disposable canary inside this pilot.

### Attempts used

Three agent attempts were consumed: two non-interactive attempts were terminated,
and the interactive attempt completed with the reporting inconsistency above.
