# Bearable BoD

AI-powered governance simulation platform. Assembles advisory boards from configurable personas, runs multi-phase deliberation sessions (interrogation, cross-examination, advise, vote, synthesis), and generates structured deliverables.

## Stack

- **Runtime:** Next.js 16 on AWS Amplify (WEB_COMPUTE)
- **AI:** AWS Bedrock (Claude Sonnet/Haiku, Nova, Llama, Mistral)
- **Database:** Aurora PostgreSQL + pgvector
- **Storage:** S3 (documents, deliverables)
- **Email:** SES (magic links, invites)
- **Voice:** Polly (TTS for seat reveals)

## Development

```bash
npm install
npm run dev
```

## Environment

Copy `.env.example` and fill in values. Required: `DATABASE_URL`, `AWS_REGION`, `S3_BUCKET_DOCUMENTS`.

## Deployment

Pushes to `main` auto-deploy via AWS Amplify. The 30-second gateway ceiling constrains all API routes to ~22s p95.
