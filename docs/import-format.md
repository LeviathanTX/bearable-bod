# Board Member Import Format

`POST /api/board-members/import`

Body: JSON array of board member objects.

## Schema

```json
[
  {
    "name": "string (required)",
    "title": "string (required)",
    "committeeRole": "string (optional) - e.g. 'CMIO / Clinical'",
    "expertise": ["string array (optional)"],
    "personaPrompt": "string (optional) - the core persona definition",
    "seatContext": "string (optional) - org/vertical context for this seat",
    "interrogationStyle": "string (optional) - one-line style description",
    "avatarEmoji": "string (optional) - single emoji",
    "model": "string (optional) - Bedrock model ID, defaults to 'us.anthropic.claude-sonnet-4-6'"
  }
]
```

## ILLUSTRATIVE Example

```json
[
  {
    "name": "Dr. Sarah Chen",
    "title": "Chief Medical Information Officer",
    "committeeRole": "CMIO / Clinical Champion",
    "expertise": ["Clinical workflows", "EHR integration", "Evidence-based medicine", "Patient safety"],
    "personaPrompt": "You are the CMIO on a healthcare enterprise buying committee. You evaluate every vendor through the lens of clinical impact, physician workflow burden, and patient safety. You demand peer-reviewed evidence and real EHR integration, not standalone dashboards...",
    "seatContext": "Our health system runs Epic across 12 hospitals. We have a strict clinical validation process requiring IRB-approved studies before AI tools touch patient data.",
    "interrogationStyle": "Evidence-driven, clinical-first. Demands published validation. Skeptical of marketing.",
    "avatarEmoji": "🩺",
    "model": "us.anthropic.claude-sonnet-4-6"
  }
]
```

## Notes

- All content is ILLUSTRATIVE and should be replaced with the operator's real expertise.
- The `personaPrompt` is the most important field - it defines the "20 years of brain" for that seat.
- The `seatContext` carries org-specific details that change per engagement (budgets, timelines, tech stack).
- Each import creates a version 1 entry in `board_member_versions` for rollback support.
