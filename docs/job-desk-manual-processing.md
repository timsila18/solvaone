# Manual Job Desk processing

Job Desk defaults to manual processing. `JOB_DESK_AI_MODE=automatic` explicitly enables paid CV generation, suitability review, cover letters and answer drafts. Any other value, including an absent variable, keeps those calls disabled.

In manual mode:

- Admin CV intake extracts PDF/DOCX text locally and fills explicit contact fields. The extracted text remains visible for checking and copying.
- Create the order with verified candidate details, preferences, consent and payment evidence.
- Open the order, expand **Prepare CV manually**, and enter the verified summary, skills, experience and education. Codex can perform these steps during an active session.
- Save the draft, review it, then use **Approve CV**. Manual drafts create no AI run or token charge.
- Choose suitable vacancies and submit through the employer's route. Record the submission and its evidence using the existing manual/external submission controls.

Automatic preparation and matching tasks are suppressed at enqueue and execution. Previously queued AI tasks are cancelled with a manual-review result without invoking OpenAI. Existing submission tasks, notifications, vacancy discovery, payment checkout and application records remain available. Quota failures are terminal for that task instead of automatically retrying or splitting the request into extra calls.

This switch covers Job Desk's OpenAI calls. Other SolvaOne AI products and Codex usage have their own billing. Codex does not operate unattended when its session is closed.

No database migration is required. Production takes effect only after deploying this code; check that the production environment has not explicitly set `JOB_DESK_AI_MODE=automatic`.
