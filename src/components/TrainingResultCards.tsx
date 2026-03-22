import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Calculator, Check, Copy, Dumbbell, Lightbulb, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import TrainingDayCard from '@/components/training/TrainingDayCard';
import { parseTrainingSections } from '@/lib/trainingResultParser';

interface TrainingResultCardsProps {
  markdown: string;
}

const markdownTableClasses = 'prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_table]:w-full [&_th]:bg-muted [&_th]:p-1.5 [&_td]:p-1.5 [&_td]:border [&_th]:border [&_table]:block [&_table]:overflow-x-auto';

const sanitizeCopyText = (value: string) => value.replace(/\*\*/g, '').replace(/^#+\s*/gm, '').trim();

const CopyButton: React.FC<{ text: string; label?: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copiado!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Erro ao copiar');
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 gap-1 px-2 text-xs">
      {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
      {label || 'Copiar'}
    </Button>
  );
};

const TrainingResultCards: React.FC<TrainingResultCardsProps> = ({ markdown }) => {
  const sections = parseTrainingSections(markdown);
  const rendered: React.ReactNode[] = [];
  let messageGroup: string[] = [];

  const flushMessages = () => {
    if (messageGroup.length === 0) return;
    rendered.push(
      <Card key={`msg-${rendered.length}`} className="border-primary/20 bg-gradient-to-br from-primary/8 to-accent/8">
        <CardContent className="space-y-3 p-4">
          <div className="mb-2 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-bold">Mensagens para WhatsApp</h3>
          </div>
          {messageGroup.map((msg, index) => {
            const cleanMessage = sanitizeCopyText(msg);
            return (
              <div key={index} className="space-y-2 rounded-xl bg-secondary/60 p-3">
                <div className="whitespace-pre-wrap text-sm">{cleanMessage}</div>
                <div className="flex justify-end">
                  <CopyButton text={cleanMessage} label="Copiar mensagem" />
                </div>
              </div>
            );
          })}
          <div className="flex justify-end pt-1">
            <CopyButton
              text={messageGroup.map(msg => sanitizeCopyText(msg)).join('\n\n---\n\n')}
              label="Copiar todas"
            />
          </div>
        </CardContent>
      </Card>
    );
    messageGroup = [];
  };

  for (const section of sections) {
    if (section.type === 'message') {
      messageGroup.push(section.content);
      continue;
    }

    flushMessages();

    if (section.type === 'training' && section.days) {
      rendered.push(
        <div key={`training-${rendered.length}`} className="space-y-3">
          {section.title && (
            <h3 className="flex items-center gap-2 text-base font-bold">
              <Dumbbell className="h-4 w-4 text-primary" />
              {section.title}
            </h3>
          )}
          {section.days.map((day, index) => (
            <TrainingDayCard
              key={`${day.day}-${index}`}
              day={day}
              index={index}
              onCopy={(text, label) => <CopyButton text={text} label={label} />}
            />
          ))}
        </div>
      );
      continue;
    }

    if (section.type === 'summary') {
      rendered.push(
        <Card key={`summary-${rendered.length}`} className="border-primary/20 bg-gradient-to-br from-background to-secondary/40">
          <CardContent className="p-4">
            {section.title && (
              <div className="mb-3 flex items-center gap-2">
                <Calculator className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold">{section.title}</h3>
              </div>
            )}
            <div className={markdownTableClasses}>
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
            <div className="mt-2 flex justify-end">
              <CopyButton text={sanitizeCopyText(section.content)} />
            </div>
          </CardContent>
        </Card>
      );
      continue;
    }

    if (section.type === 'tip') {
      rendered.push(
        <Card key={`tip-${rendered.length}`} className="border-accent/30 bg-gradient-to-br from-accent/10 to-secondary/40">
          <CardContent className="p-4">
            <div className="flex items-start gap-2">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="flex-1">
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                  <ReactMarkdown>{section.content}</ReactMarkdown>
                </div>
                <div className="mt-2 flex justify-end">
                  <CopyButton text={sanitizeCopyText(section.content)} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
      continue;
    }

    if (section.type === 'table') {
      rendered.push(
        <Card key={`table-${rendered.length}`} className="bg-card">
          <CardContent className="p-4">
            {section.title && <h3 className="mb-2 text-sm font-bold">{section.title}</h3>}
            <div className={markdownTableClasses}>
              <ReactMarkdown>{section.content}</ReactMarkdown>
            </div>
            <div className="mt-2 flex justify-end">
              <CopyButton text={sanitizeCopyText(section.content)} />
            </div>
          </CardContent>
        </Card>
      );
      continue;
    }

    if (section.type === 'text' && section.content.trim()) {
      const trimmed = section.content.trim();
      if (trimmed.startsWith('#')) {
        rendered.push(
          <h3 key={`h-${rendered.length}`} className="mt-2 text-base font-bold">
            {trimmed.replace(/^#+\s*/, '')}
          </h3>
        );
      } else if (trimmed.length > 10) {
        rendered.push(
          <p key={`p-${rendered.length}`} className="text-sm text-muted-foreground">
            {trimmed}
          </p>
        );
      }
    }
  }

  flushMessages();

  return <div className="space-y-4">{rendered}</div>;
};

export default TrainingResultCards;
