/**
 * Normalize budget API errors for user-facing messages.
 */
export function getBudgetErrorMessage(err, fallback = 'Something went wrong while loading department budgets.') {
  const data = err?.response?.data;
  const detail = data?.error;
  const raw = data?.message || detail || data?.msg || err?.message || fallback;
  let message = String(raw);

  const replacements = [
    [/budget containers/gi, 'department budgets'],
    [/budget container/gi, 'department budget'],
    [/Error fetching container/gi, 'Could not load department budget'],
    [/Container not found/gi, 'Department budget not found'],
    [/This container is/gi, 'This department budget is'],
    [/Error adding container/gi, 'Error adding department budget'],
    [/Error removing container/gi, 'Error removing department budget'],
    [/Failed to create registry project from budget item\./gi, 'Could not create registry project from this budget line.'],
  ];

  replacements.forEach(([pattern, replacement]) => {
    message = message.replace(pattern, replacement);
  });

  if (detail && !message.includes(detail) && detail !== raw) {
    message = `${message} (${detail})`;
  }

  const status = err?.response?.status;
  if (status && !message.includes(String(status))) {
    message += ` (HTTP ${status})`;
  }

  return message;
}
