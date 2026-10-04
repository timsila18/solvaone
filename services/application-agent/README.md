# Dedicated Application Agent

This first milestone moves supported Greenhouse and Lever browser execution off
Vercel functions into a persistent service. Existing SolvaOne matching, payment,
CV approval, authorization, send locks, reports and client notifications remain
the control plane. This is not an unrestricted autonomous browser or a promise
of ten vacancies. Other portals and discovery expansion are separate milestones.

Build from the repository root:

```sh
docker build -f services/application-agent/Dockerfile -t solvaone-application-agent .
docker run --restart unless-stopped -p 127.0.0.1:8080:8080 \
  -e APPLICATION_AGENT_TOKEN -v application-agent-data:/data solvaone-application-agent
```

Use a dedicated host behind HTTPS, an encrypted persistent volume, private
network/firewall restrictions and a unique secret of at least 32 characters.
Do not supply database, OpenAI or Resend keys to this container. Set the same
secret as APPLICATION_AGENT_TOKEN in Vercel and set APPLICATION_AGENT_URL to
the HTTPS service origin. With the URL unset, existing sandbox execution stays
unchanged. Keep SolvaOne's scheduled task queue enabled; this service does not
replace its scheduler.

Each match UUID is a durable idempotency key. Repeated POSTs return the existing
attempt, never launch another submission. Queued jobs survive restart. Running
jobs interrupted by restart are held as uncertain, never silently retried.
Completed results survive reconnects. A confirmed portal result is then saved
by SolvaOne's existing submission handler, which queues the client update.

Before enabling production: build and run the container, test disk persistence
and restart behavior, verify HTTPS/authentication, run a non-submitting portal
check, then complete one authorized real application and verify the employer
receipt, SolvaOne counter and client notification. Do not call the service live
or end-to-end verified until those checks pass.

Candidate documents remain in the mounted volume. Establish access controls,
encrypted backups and a retention/deletion policy before importing clients.
After an uncertain result, an administrator must reconcile employer evidence.
Do not delete its ledger or change its application ID to force a retry.
