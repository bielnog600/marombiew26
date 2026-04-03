import React from 'react';
import AppLayout from '@/components/AppLayout';

const WhatsAppWeb: React.FC = () => {
  return (
    <AppLayout title="WhatsApp Web">
      <div className="h-[calc(100vh-8rem)] w-full rounded-lg overflow-hidden border border-border">
        <iframe
          src="https://web.whatsapp.com"
          className="w-full h-full"
          title="WhatsApp Web"
          allow="camera; microphone"
        />
      </div>
    </AppLayout>
  );
};

export default WhatsAppWeb;
