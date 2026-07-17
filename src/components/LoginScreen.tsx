import { useState } from 'react';
import { Ticket, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Button, Input } from './ui';

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      if (password.length < 6) {
        setError('A senha deve ter no mínimo 6 caracteres.');
        setLoading(false);
        return;
      }
      const { error } = await signUp(email, password, name, 'operator');
      if (error) setError(error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-900/50 mb-4">
            <Ticket className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">Bolão Caixa</h1>
          <p className="text-slate-400 text-sm mt-1">Sistema de Gestão de Bolões de Loterias</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${mode === 'login' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
            >
              <LogIn size={16} /> Entrar
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${mode === 'signup' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
            >
              <UserPlus size={16} /> Cadastrar
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Input label="Nome completo" value={name} onChange={setName} placeholder="Seu nome" required />
            )}
            <Input label="E-mail" type="email" value={email} onChange={setEmail} placeholder="seu@email.com" required />
            <Input label="Senha" type="password" value={password} onChange={setPassword} placeholder="••••••••" required />

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>

          {mode === 'signup' && (
            <p className="text-xs text-slate-400 text-center mt-4">
              Novos usuários são cadastrados como operador. Um administrador pode alterar seu papel e filial depois.
            </p>
          )}
        </div>
        <p className="text-center text-slate-500 text-xs mt-6">
          Loterias da Caixa Econômica Federal — Gestão de Bolões
        </p>
      </div>
    </div>
  );
}
