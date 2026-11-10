/**
 * R5 public-web fallback contact for players who never minted an in-app code.
 * Carlos sets `EXPO_PUBLIC_ACCOUNT_DELETION_SUPPORT_EMAIL` for store builds.
 */
export function readDeletionSupportEmail(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | null {
  const raw = env.EXPO_PUBLIC_ACCOUNT_DELETION_SUPPORT_EMAIL?.trim() ?? '';
  if (!raw || !raw.includes('@')) return null;
  return raw;
}

export function buildDeletionSupportMailto(input: {
  supportEmail: string;
  contactEmail: string;
  platform: string;
  platformId: string;
  notes?: string;
}): string {
  const subject = encodeURIComponent('Botore account deletion request');
  const body = encodeURIComponent(
    [
      'Please delete my Botore account.',
      '',
      `Contact email: ${input.contactEmail.trim()}`,
      `Platform: ${input.platform.trim()}`,
      `Platform player id: ${input.platformId.trim()}`,
      input.notes?.trim() ? `Notes: ${input.notes.trim()}` : null,
      '',
      'I confirm I am the account owner.',
    ]
      .filter((line): line is string => line != null)
      .join('\n'),
  );
  return `mailto:${input.supportEmail}?subject=${subject}&body=${body}`;
}
