import { createLineHandler, openAIClassifier } from './worker.mjs';

declare const EdgeRuntime: { waitUntil: (task: Promise<unknown>) => void };

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

Deno.serve(createLineHandler({
  secret: required('LINE_CHANNEL_SECRET'),
  token: required('LINE_CHANNEL_ACCESS_TOKEN'),
  allowedUsers: new Set(required('LINE_PILOT_USER_IDS').split(',').map(value => value.trim()).filter(Boolean)),
  classify: openAIClassifier({ key: required('OPENAI_API_KEY'), model: required('LINE_OPENAI_MODEL') }),
  defer: (task: Promise<unknown>) => EdgeRuntime.waitUntil(task),
}));
