tasks.register("qualityGate") {
    group = "verification"
    description = "Runs the project's existing deterministic quality controls."
    dependsOn(
        "ktlintCheck",
        "detekt",
        "lintDebug",
        "testDebugUnitTest",
        "assembleDebug",
    )
}
