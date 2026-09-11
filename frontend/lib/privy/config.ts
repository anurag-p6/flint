/// Privy App ID from https://dashboard.privy.io (free).
/// Until set, the email login box shows a setup notice and the rest of
/// the app works as before.
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export const privyEnabled = PRIVY_APP_ID.length > 0;
