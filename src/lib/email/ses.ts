import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

let sesClient: SESClient | null = null;

function getSES(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });
  }
  return sesClient;
}

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailParams): Promise<void> {
  const from = process.env.SES_FROM_EMAIL || 'noreply@bearableai.com';

  const command = new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: { Html: { Data: html } },
    },
  });

  await getSES().send(command);
}
