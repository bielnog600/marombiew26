import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Heart, Calculator, Save } from 'lucide-react';

interface KarvonenZonesProps {
  studentId: string;
  birthDate: string | null;
  fcRepouso: number | null;
  readOnly?: boolean;
}

interface ZoneData {
  zona: string;
  label: string;
  min: number;
  max: number;
  desc: string;
}

interface SavedHrZone {
  id: string;
  fc_repouso: number;
  fcmax_formula: string;
  fcmax_estimada: number;
  hrr: number;
  zonas_karvonen: ZoneData[];
  data_calculo: string;
}

const ZONE_COLORS = [
  'hsl(142 71% 45%)',
  'hsl(142 60% 40%)',
  'hsl(45 100% 50%)',
  'hsl(25 95% 53%)',
  'hsl(0 72% 51%)',
];

const ZONE_DEFS = [
  { zona: 'Z1', label: 'Recuperação', lo: 0.50, hi: 0.60, desc: 'Aquecimento, recuperação ativa' },
  { zona: 'Z2', label: 'Base', lo: 0.60, hi: 0.70, desc: 'Exercício leve, oxidação lipídica' },
  { zona: 'Z3', label: 'Moderada', lo: 0.70, hi: 0.80, desc: 'Resistência cardiovascular' },
  { zona: 'Z4', label: 'Forte', lo: 0.80, hi: 0.90, desc: 'Alta intensidade, VO2max' },
  { zona: 'Z5', label: 'Máxima', lo: 0.90, hi: 1.00, desc: 'Esforço máximo, sprints' },
];

const calcAge = (birthDate: string): number =>
  Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 24 * 3600 * 1000));

export const calcKarvonenZones = (age: number, fcRepouso: number, formula: string): {
  fcMax: number; hrr: number; zones: ZoneData[];
} => {
  const fcMax = formula === 'tanaka'
    ? Math.round(208 - 0.7 * age)
    : 220 - age;
  const hrr = fcMax - fcRepouso;
  const zones: ZoneData[] = ZONE_DEFS.map(z => ({
    zona: z.zona,
    label: z.label,
    min: Math.round(fcRepouso + hrr * z.lo),
    max: Math.round(fcRepouso + hrr * z.hi),
    desc: z.desc,
  }));
  return { fcMax, hrr, zones };
};

const KarvonenZones: React.FC<KarvonenZonesProps> = ({ studentId, birthDate, fcRepouso, readOnly }) => {
  const [formula, setFormula] = useState<string>('tanaka');
  const [saved, setSaved] = useState<SavedHrZone | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSaved();
  }, [studentId]);

  const loadSaved = async () => {
    const { data } = await supabase
      .from('hr_zones')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setSaved({
        ...data,
        zonas_karvonen: data.zonas_karvonen as unknown as ZoneData[],
      });
      setFormula(data.fcmax_formula);
    }
  };

  const age = birthDate ? calcAge(birthDate) : null;

  if (!age) {
    return (
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /> Zonas de Frequência Cardíaca (Karvonen)</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Preencha a data de nascimento do aluno para calcular as zonas.</p>
        </CardContent>
      </Card>
    );
  }

  if (!fcRepouso) {
    return (
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Heart className="w-4 h-4 text-primary" /> Zonas de Frequência Cardíaca (Karvonen)</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-destructive font-medium">Preencha a FC de repouso para calcular as zonas.</p>
        </CardContent>
      </Card>
    );
  }

  const { fcMax, hrr, zones } = calcKarvonenZones(age, fcRepouso, formula);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Upsert: delete old and insert new
      await supabase.from('hr_zones').delete().eq('student_id', studentId);
      const { error } = await supabase.from('hr_zones').insert({
        student_id: studentId,
        fc_repouso: fcRepouso,
        fcmax_formula: formula,
        fcmax_estimada: fcMax,
        hrr,
        zonas_karvonen: zones as any,
        data_calculo: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success('Zonas de FC salvas com sucesso!');
      await loadSaved();
    } catch (err: any) {
      toast.error('Erro ao salvar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const displayZones = saved ? saved.zonas_karvonen : zones;
  const displayFcMax = saved ? saved.fcmax_estimada : fcMax;
  const displayHrr = saved ? saved.hrr : hrr;
  const displayFormula = saved ? saved.fcmax_formula : formula;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Heart className="w-4 h-4 text-primary" /> Zonas de Frequência Cardíaca (Karvonen)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Método de Reserva de FC (Karvonen): FC alvo = FC repouso + (HRR × intensidade)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        {!readOnly && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Fórmula FC Máx</label>
              <Select value={formula} onValueChange={setFormula}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tanaka">Tanaka (208 - 0,7 × idade)</SelectItem>
                  <SelectItem value="220">Tradicional (220 - idade)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={loading} size="sm" className="font-semibold">
              {loading ? <Calculator className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Calcular e Salvar
            </Button>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Idade', value: `${age} anos` },
            { label: 'FC Repouso', value: `${fcRepouso} bpm` },
            { label: 'FC Máx estimada', value: `${displayFcMax} bpm`, sub: displayFormula === 'tanaka' ? 'Tanaka' : '220-idade' },
            { label: 'Reserva (HRR)', value: `${displayHrr} bpm` },
          ].map(item => (
            <div key={item.label} className="rounded-lg bg-secondary/40 p-3 text-center">
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
              <p className="text-sm font-bold">{item.value}</p>
              {item.sub && <p className="text-[9px] text-muted-foreground">{item.sub}</p>}
            </div>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground italic">
          * FC Máx é uma estimativa e pode variar por pessoa. Para precisão, recomenda-se teste ergométrico.
        </p>

        {/* Zones table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0 rounded-lg overflow-hidden">
            <thead>
              <tr>
                <th className="text-left py-3 px-4 font-semibold bg-primary/20 text-foreground">Zona de Frequência</th>
                <th className="text-center py-3 px-4 font-semibold bg-primary/10 text-foreground">Intervalo (bpm)</th>
                <th className="text-left py-3 px-4 font-semibold bg-primary/20 text-foreground">Descrição</th>
              </tr>
            </thead>
            <tbody>
              {displayZones.map((z, i) => (
                <tr key={i}>
                  <td className="py-3 px-4 font-bold bg-secondary/60" style={{ borderLeft: `4px solid ${ZONE_COLORS[i]}` }}>
                    <span style={{ color: ZONE_COLORS[i] }}>{z.zona} — {z.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">({Math.round((i * 10 + 50))}%–{Math.round((i * 10 + 60))}%)</span>
                  </td>
                  <td className="py-3 px-4 text-center font-mono font-bold bg-secondary/30">
                    {z.min} – {z.max} bpm
                  </td>
                  <td className="py-3 px-4 text-muted-foreground bg-secondary/60">{z.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {saved && (
          <p className="text-[10px] text-muted-foreground text-right">
            Calculado em: {new Date(saved.data_calculo).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default KarvonenZones;
