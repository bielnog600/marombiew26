import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PROTOCOLS, extractProtocolSection, type ProtocolKey } from '@/lib/dietProtocols';

interface ProtocolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keys: ProtocolKey[];
  markdown: string;
}

const ProtocolsDialog: React.FC<ProtocolsDialogProps> = ({ open, onOpenChange, keys, markdown }) => {
  const [active, setActive] = useState<string>(keys[0] ?? '');

  // Re-sync active tab if keys change
  React.useEffect(() => {
    if (keys.length && !keys.includes(active as ProtocolKey)) setActive(keys[0]);
  }, [keys, active]);

  const details = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const k of keys) map[k] = extractProtocolSection(markdown, k);
    return map;
  }, [keys, markdown]);

  if (!keys.length) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/50">
          <DialogTitle className="text-base">Protocolos do seu plano</DialogTitle>
          <DialogDescription className="text-xs">
            Estratégias e ajustes ativados pelo seu nutricionista. Toque em cada aba para entender.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={active} onValueChange={setActive} className="flex-1 flex flex-col min-h-0">
          <div className="w-full border-b border-border/50 overflow-x-auto scrollbar-none touch-pan-x">
            <TabsList className="inline-flex h-auto min-w-full bg-transparent p-2 gap-1 flex-nowrap">
              {keys.map((k) => {
                const info = PROTOCOLS[k];
                const Icon = info.icon;
                return (
                  <TabsTrigger
                    key={k}
                    value={k}
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-4 py-2 text-xs gap-1.5 whitespace-nowrap shrink-0 transition-all border border-transparent data-[state=inactive]:hover:bg-secondary/50"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {info.short}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <ScrollArea className="flex-1 px-5 py-4">
            {keys.map((k) => {
              const info = PROTOCOLS[k];
              const Icon = info.icon;
              const detail = details[k];
              return (
                <TabsContent key={k} value={k} className="mt-0 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-foreground">{info.label}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {info.description}
                      </p>
                    </div>
                  </div>

                  {detail ? (
                    <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                        Detalhes do seu plano
                      </p>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs text-foreground/90 [&_strong]:text-foreground [&_table]:text-[11px] [&_table]:w-full [&_th]:bg-muted [&_th]:p-1.5 [&_td]:p-1.5 [&_td]:border [&_th]:border [&_table]:block [&_table]:overflow-x-auto [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:my-0.5">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/60 p-3 text-center">
                      <p className="text-xs text-muted-foreground">
                        Este protocolo foi ativado no seu plano. Detalhes específicos serão exibidos aqui assim que disponíveis.
                      </p>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ProtocolsDialog;