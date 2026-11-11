import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal, Spinner } from './ui';

interface BillAttachmentPreviewProps {
  path: string | null;
  name: string | null;
  onClose: () => void;
}

export function BillAttachmentPreview({ path, name, onClose }: BillAttachmentPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const isPdf = (name ?? path ?? '').toLowerCase().endsWith('.pdf');

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    supabase.storage.from('fin-bill-attachments').createSignedUrl(path, 3600).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data?.signedUrl) setFailed(true);
      else setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <Modal open={!!path} onClose={onClose} title={name ?? 'Anexo'} maxWidth="max-w-4xl">
      {failed ? (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">Não foi possível abrir o anexo.</p>
      ) : !url ? (
        <div className="flex items-center justify-center py-16"><Spinner className="text-brand-500" /></div>
      ) : isPdf ? (
        <iframe src={url} title={name ?? 'Anexo'} className="w-full h-[70vh] rounded-lg border border-slate-200" />
      ) : (
        <img src={url} alt={name ?? 'Anexo'} className="max-h-[70vh] mx-auto rounded-lg" />
      )}
    </Modal>
  );
}
