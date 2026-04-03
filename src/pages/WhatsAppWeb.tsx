import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { ExternalLink, MessageCircle } from 'lucide-react';

const WhatsAppWeb: React.FC = () => {
  const handleOpen = () => {
    window.open('https://web.whatsapp.com', '_blank', 'noopener,noreferrer');
  };

  return (
    <AppLayout title="WhatsApp Web">
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10">
          <MessageCircle className="h-10 w-10 text-green-500" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <h2 className="text-xl font-semibold text-foreground">WhatsApp Web</h2>
          <p className="text-sm text-muted-foreground">
            Abra o WhatsApp Web em uma nova aba para escanear o QR Code e enviar mensagens diretamente aos seus alunos.
          </p>
        </div>
        <Button onClick={handleOpen} size="lg" className="bg-green-600 hover:bg-green-700 text-white">
          <ExternalLink className="h-4 w-4 mr-2" />
          Abrir WhatsApp Web
        </Button>
      </div>
    </AppLayout>
  );
};

export default WhatsAppWeb;
