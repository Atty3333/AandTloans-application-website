import { passwordStrength } from '@/lib/password';

const COLORS = ['bg-red-400', 'bg-red-400', 'bg-amber-400', 'bg-lime-500', 'bg-green-600'];

/** Four-segment strength meter shown under the new-password field. */
export default function PasswordStrength({ password, id }: { password: string; id: string }) {
  if (!password) return null;
  const { score, label } = passwordStrength(password);
  return (
    <div id={id} className="-mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-full ${n <= score ? COLORS[score] : 'bg-slate-200'}`} />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Password strength: <span className="font-semibold">{label}</span>. Use 12+ characters, mixed case, a number and a symbol for a strong one.
      </p>
    </div>
  );
}
