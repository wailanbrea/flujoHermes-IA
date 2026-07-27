<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/DiscountCalculator.php';

function expectSame(int $expected, int $actual, string $case): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            sprintf('%s: expected %d, got %d', $case, $expected, $actual)
        );
    }
}

expectSame(850, DiscountCalculator::apply(1000, 15), 'standard discount');
expectSame(1, DiscountCalculator::apply(1, 50), 'half-up boundary');

try {
    DiscountCalculator::apply(100, 101);
    throw new RuntimeException('invalid percentage was accepted');
} catch (InvalidArgumentException) {
}

echo "PILOT_TESTS_OK\n";
