# Zapier ClickBot counter-proof

## 1. Set environment variables

PowerShell:

```powershell
$env:ZAPIER_CLIENT_ID="SEU_CLIENT_ID"
$env:ZAPIER_CLIENT_SECRET="SEU_CLIENT_SECRET"
$env:ZAPIER_CONNECTION_ID="02c96d4d-1deb-877a-892a-544525ce469f"
```

Optional:

```powershell
$env:ZAPIER_TEAM_ID="9011600909"
$env:ZAPIER_VIEW_ID="8cj47gd-16871"
$env:ZAPIER_MESSAGE="CONTRAPROVA CLIENT CREDENTIALS BOT"
$env:ZAPIER_SCOPE="external"
$env:ZAPIER_AUDIENCE="zapier.com"
```

## 2. Run

Requires Node.js 18+ (Node 20+ recommended):

```powershell
node .\supabase\snippets\zapier-clickbot-counterproof.mjs
```

## 3. What the script proves

It prints:

- whether the token is JWT-like;
- whether the script selects `JWT` or `Bearer`;
- token response metadata (without printing the token);
- the exact action inputs;
- the HTTP status and raw run response;
- headers that could indicate async polling.

The action body uses the values proven during the investigation:

```json
{
  "selected_api": "ClickUpCLIAPI@2.1.63",
  "action_key": "createChatMessage",
  "action_type": "write",
  "authentication_id": "02c96d4d-1deb-877a-892a-544525ce469f",
  "inputs": {
    "team_id": 9011600909,
    "view_id": "8cj47gd-16871",
    "comment_type": "message",
    "comment_text": "...",
    "send_as_bot": true
  }
}
```

**Never commit `ZAPIER_CLIENT_SECRET` to the repository.**
