import { useState, type FormEvent } from 'react';
import { Lock } from 'lucide-react';
import { api, setToken } from '../lib/api';
import { Button, Field, FormError } from '../components/ui';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!password) { setError('Parolni kiriting'); return; }
    setLoading(true); setError('');
    try {
      const r = await api.post<{ token: string }>('/login', { password });
      setToken(r.token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xatolik');
    } finally { setLoading(false); }
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-gradient-to-b from-brand-50 to-white px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-6 shadow-card">
        <div className="mb-5 flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="mb-3 h-14 w-14 rounded-2xl" />
          <h1 className="text-xl font-bold text-stone-900">Ferma — chorvachilik hisobi</h1>
          <p className="mt-1 text-sm text-stone-500">Davom etish uchun parolni kiriting</p>
        </div>
        <FormError message={error} />
        <Field label="Parol">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input type="password" autoFocus autoComplete="current-password" className="input pl-9" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </Field>
        <Button type="submit" className="mt-4 w-full" size="lg" loading={loading}>Kirish</Button>
      </form>
    </div>
  );
}
