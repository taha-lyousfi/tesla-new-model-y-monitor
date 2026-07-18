export async function deliverAndAdvance({ changes, sendChanges, advanceState }) {
  if (!changes.length) {
    await advanceState();
    return { advanced: true, notification: null };
  }

  const notification = await sendChanges();
  if (!notification.sent) return { advanced: false, notification };

  await advanceState();
  return { advanced: true, notification };
}
