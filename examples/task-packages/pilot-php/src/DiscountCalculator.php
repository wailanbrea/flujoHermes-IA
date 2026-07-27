<?php

declare(strict_types=1);

final class DiscountCalculator
{
    public static function apply(int $subtotalMinor, int $percent): int
    {
        if ($subtotalMinor < 0 || $percent < 0 || $percent > 100) {
            throw new InvalidArgumentException('Invalid discount input.');
        }

        return (int) round($subtotalMinor * (100 - $percent) / 100, 0, PHP_ROUND_HALF_UP);
    }
}
