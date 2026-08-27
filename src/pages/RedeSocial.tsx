import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Film, Images, ArrowLeft } from 'lucide-react';
import ReelsGenerator from '@/components/social/ReelsGenerator';
import CarouselGenerator from '@/components/social/CarouselGenerator';
import SocialGallery from '@/components/social/SocialGallery';

type Mode = 'hub' | 'reels' | 'carousel';

const RedeSocial: React.FC = () => {
  const [mode, setMode] = useState<Mode>('hub');
  const [refreshKey, setRefreshKey] = useState(0);
  const onSaved = () => setRefreshKey((k) => k + 1);

  return (
    <AppLayout title="Rede Social">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            size="lg"
            variant={mode === 'reels' ? 'default' : 'secondary'}
            className="h-20 flex-col gap-1"
            onClick={() => setMode(mode === 'reels' ? 'hub' : 'reels')}
          >
            <Film className="h-5 w-5" />
            Gerador de Reels
          </Button>
          <Button
            size="lg"
            variant={mode === 'carousel' ? 'default' : 'secondary'}
            className="h-20 flex-col gap-1"
            onClick={() => setMode(mode === 'carousel' ? 'hub' : 'carousel')}
          >
            <Images className="h-5 w-5" />
            Gerar Carrossel
          </Button>
        </div>

        {mode !== 'hub' && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode('hub')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Fechar editor
            </Button>
            {mode === 'reels' ? (
              <ReelsGenerator onSaved={onSaved} />
            ) : (
              <CarouselGenerator onSaved={onSaved} />
            )}
          </>
        )}

        <SocialGallery refreshKey={refreshKey} />
      </div>
    </AppLayout>
  );
};

export default RedeSocial;
