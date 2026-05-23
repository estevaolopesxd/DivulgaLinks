import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { instagramApi } from '../services/api';
import { PageLoader } from '../components/ui/LoadingSpinner';

const InstagramCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;

    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      toast.error(`Autorização negada: ${searchParams.get('error_description') ?? error}`);
      navigate('/instagram', { replace: true });
      return;
    }

    if (!code) {
      toast.error('Código de autorização não encontrado na URL');
      navigate('/instagram', { replace: true });
      return;
    }

    processed.current = true;

    instagramApi
      .connect(code)
      .then(() => {
        toast.success('Conta Instagram conectada com sucesso!');
        navigate('/instagram', { replace: true });
      })
      .catch((err: Error) => {
        toast.error(err.message ?? 'Erro ao conectar conta Instagram');
        navigate('/instagram', { replace: true });
      });
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <PageLoader />
      <p className="text-gray-600 text-sm">Conectando sua conta Instagram...</p>
    </div>
  );
};

export default InstagramCallback;
