/** Password strength 0-4 for the sign-up hint (length and character variety; not a security guarantee). */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const s = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: ['Too short', 'Weak', 'Okay', 'Good', 'Strong'][pw.length < 8 ? 0 : Math.max(1, s)] };
}
