import { useState } from 'react';
import { Mail, Lock, AlertCircle, CheckCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { Button, Input } from './ui';

export function ResetPassword({ onBack }: { onBack: () => void }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await resetPassword(email);
    if (error) {
      setError(error);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-accent-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-brand-500/20 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-2xl p-3 shadow-2xl shadow-brand-950/50 mb-4">
            <img
              src="/assets/1000448454-removebg-preview.png"
              alt="Mega Bolão Brasil"
              className="h-20 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-white">Mega Bolão Brasil</h1>
          <p className="text-slate-400 text-sm mt-1">Sistema de Gestão</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <KeyRound size={22} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Redefinir Senha</h2>
              <p className="text-xs text-slate-500">Enviaremos um link para seu e-mail</p>
            </div>
          </div>

          {sent ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <CheckCircle size={18} className="mt-0.5 shrink-0" />
                <span>Enviamos um link de redefinição para <strong>{email}</strong>. Verifique sua caixa de entrada e spam.</span>
              </div>
              <Button variant="secondary" onClick={onBack} className="w-full">
                <ArrowLeft size={16} /> Voltar para o login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="E-mail cadastrado"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="seu@email.com"
                required
              />

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" size="lg" disabled={loading} className="w-full">
                {loading ? 'Enviando...' : 'Enviar link de redefinição'}
              </Button>

              <button
                type="button"
                onClick={onBack}
                className="w-full text-sm text-slate-500 hover:text-brand-600 flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft size={14} /> Voltar para o login
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export function UpdatePassword({ onSuccess }: { onSuccess: () => void }) {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    const { error } = await updatePassword(password);
    if (error) {
      setError(error);
      setLoading(false);
      return;
    }
    setLoading(false);
    onSuccess();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-accent-500/20 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-72 h-72 bg-brand-500/20 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-white rounded-2xl p-3 shadow-2xl shadow-brand-950/50 mb-4">
            <img
              src="/assets/1000448454-removebg-preview.png"
              alt="Mega Bolão Brasil"
              className="h-20 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl font-bold text-white">Mega Bolão Brasil</h1>
          <p className="text-slate-400 text-sm mt-1">Sistema de Gestão</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <Lock size={22} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Nova Senha</h2>
              <p className="text-xs text-slate-500">Digite sua nova senha de acesso</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nova senha"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
            />
            <Input
              label="Confirmar senha"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="••••••••"
              required
            />

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
