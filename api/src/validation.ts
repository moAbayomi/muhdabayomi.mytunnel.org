import type { Context } from 'hono';

export function validationErrorHook(
  result: { success: boolean; error?: any },
  c: Context
) {
  if (result.success) return;
  return c.json(
    {
      error: {
        code: 'validation_failed',
        message: result.error.issues[0]?.message ?? 'Invalid input',
        details: result.error.flatten().fieldErrors,
        requestId: c.get('requestId'),
      },
    },
    400
  );
}