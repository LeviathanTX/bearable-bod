export function getAwsRegion(): string {
  return process.env.AWS_REGION || process.env.BEARABLE_BOD_AWS_REGION || process.env.PREBOARD_AWS_REGION || 'us-east-1';
}

export function getAwsCredentials() {
  const accessKeyId = process.env.BEARABLE_BOD_ACCESS_KEY_ID || process.env.PREBOARD_ACCESS_KEY_ID;
  const secretAccessKey = process.env.BEARABLE_BOD_SECRET_ACCESS_KEY || process.env.PREBOARD_SECRET_ACCESS_KEY;
  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey };
  }
  return undefined;
}

export function getAwsClientConfig() {
  const config: { region: string; credentials?: { accessKeyId: string; secretAccessKey: string } } = {
    region: getAwsRegion(),
  };
  const creds = getAwsCredentials();
  if (creds) config.credentials = creds;
  return config;
}
