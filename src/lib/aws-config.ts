export function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.PREBOARD_AWS_REGION || 'us-east-1';
}
