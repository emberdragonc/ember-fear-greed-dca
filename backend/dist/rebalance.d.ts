/**
 * REBALANCE SCRIPT
 *
 * Swaps excess ETH (WETH) back to USDC for wallets that were over-swapped
 * due to the cron duplicate execution bug on Feb 14, 2026.
 *
 * Usage:
 *   npx tsx backend/rebalance.ts --dry-run    # Preview only
 *   npx tsx backend/rebalance.ts              # Execute rebalance
 */
export {};
