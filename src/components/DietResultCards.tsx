import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import AnimatedSection from '@/components/AnimatedSection';
import { Calculator, Check, Copy, Lightbulb, MessageCircle, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import MealCard from '@/components/diet/MealCard';
import { parseSections } from '@/lib/dietResultParser';

interface DietResultCardsProps {
  markdown: string;
}

const markdownTableClasses = 'prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_table]:w-full [&_th]:bg-muted [&_th]:p-1.5 [&_td]:p-1.5 [&_td]:border [&_th]:border [&_table]:block [&_table]:overflow-x-auto';

const parseMarkdownTable = (content: string): { headers: string[]; rows: string[][] } | null => {
  const lines = content.trim().split('\n').filter(l => l.trim().startsWith('|'));
  if (lines.length < 3) return null;

  const splitRow = (line: string) =>
    line.trim().split('|').slice(1, -1).map(c => c.replace(/\*\*/g, '').trim());

  const headers = splitRow(lines[0]);
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].includes('---')) continue;
    const cells = splitRow(lines[i]);
    if (cells.length > 0 && cells.some(c => c)) rows.push(cells);
  }

  return headers.length > 0 && rows.length > 0 ? { headers, rows } : null;
};

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

const DietResultCards: React.FC<DietResultCardsProps> = ({ markdown }) => {
  const sections = parseSections(markdown);
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
              text={messageGroup.map((msg) => sanitizeCopyText(msg)).join('\n\n---\n\n')}
              label="Copiar todas"
            />
          </div>
        </CardContent>
      </Card>,
    );

    messageGroup = [];
  };

  for (const section of sections) {
    if (section.type === 'message') {
      messageGroup.push(section.content);
      continue;
    }

    flushMessages();

    if (section.type === 'meal' && section.meals) {
      rendered.push(
        <div key={`meals-${rendered.length}`} className="space-y-3">
          {section.title && (
            <h3 className="flex items-center gap-2 text-base font-bold">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
              {section.title}
            </h3>
          )}

          {section.meals.map((meal, index) => (
            <MealCard
              key={`${meal.name}-${meal.time || 'sem-hora'}-${index}`}
              meal={meal}
              index={index}
              onCopy={(text, label) => <CopyButton text={text} label={label} />}
            />
          ))}
        </div>,
      );
      continue;
    }

    if (section.type === 'summary') {
      const parsed = parseMarkdownTable(section.content);
      rendered.push(
        <Card key={`summary-${rendered.length}`} className="overflow-hidden border-primary/20 bg-gradient-to-br from-background to-secondary/40">
          <CardContent className="p-0">
            {section.title && (
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold">{section.title}</h3>
                </div>
                <CopyButton text={sanitizeCopyText(section.content)} />
              </div>
            )}

            {parsed ? (
              <div className="px-2 py-2">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {parsed.headers.map((h, hi) => (
                        <TableHead key={hi} className="h-9 px-3 text-xs font-semibold">
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.rows.map((row, ri) => (
                      <TableRow key={ri}>
                        {row.map((cell, ci) => (
                          <TableCell
                            key={ci}
                            className={`px-3 py-2 ${ci === 0 ? 'font-medium' : 'text-muted-foreground'}`}
                          >
                            {cell || '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className={`p-4 ${markdownTableClasses}`}>
                <ReactMarkdown>{section.content}</ReactMarkdown>
              </div>
            )}

            {!section.title && (
              <div className="flex justify-end border-t border-border/60 px-4 py-2">
                <CopyButton text={sanitizeCopyText(section.content)} />
              </div>
            )}
          </CardContent>
        </Card>,
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
        </Card>,
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
          </CardContent>
        </Card>,
      );
      continue;
    }

    if (section.type === 'text' && section.content.trim()) {
      const trimmed = section.content.trim();

      if (trimmed.startsWith('#')) {
        rendered.push(
          <h3 key={`h-${rendered.length}`} className="mt-2 text-base font-bold">
            {trimmed.replace(/^#+\s*/, '')}
          </h3>,
        );
      } else if (trimmed.length > 10) {
        rendered.push(
          <div key={`p-${rendered.length}`} className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground [&_strong]:text-foreground [&_strong]:font-semibold">
            <ReactMarkdown>{trimmed}</ReactMarkdown>
          </div>,
        );
      }
    }
  }

  flushMessages();

  return <div className="space-y-4">{rendered}</div>;
};

export default DietResultCards;
