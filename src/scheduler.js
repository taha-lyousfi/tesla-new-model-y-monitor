export function retryDelayMinutes(config, consecutiveFailures) {
  if (consecutiveFailures < 1) return config.checkIntervalMinutes;
  return Math.min(
    config.retryDelayMinutes * 2 ** (consecutiveFailures - 1),
    config.maxRetryDelayMinutes,
  );
}
