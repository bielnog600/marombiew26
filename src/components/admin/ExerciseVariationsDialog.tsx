import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Plus, Trash2, Save, Search, ChevronDown, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";

interface ExerciseLite {
  id: string;
  nome: string;
  grupo_muscular: string;
}

interface VariationGroup {
  id?: string;
  nome: string;
  descricao: string;
  exercise_ids: string[];
  _new?: boolean;
  _dirty?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ExerciseVariationsDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const qc = useQueryClient();
  const [groups, setGroups] = useState<VariationGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loadingAi, setLoadingAi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [pickerIdx, setPickerIdx] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  const { data: exercises = [], isLoading: loadingExs } = useQuery({
    queryKey: ["exercises-for-variations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, nome, grupo_muscular")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ExerciseLite[];
    },
    enabled: open,
  });

  const { data: dbGroups, isLoading: loadingGroups } = useQuery({
    queryKey: ["exercise-variation-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercise_variation_groups")
        .select("id, nome, descricao, exercise_ids")
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (dbGroups) {
      setGroups(
        dbGroups.map((g: any) => ({
          id: g.id,
          nome: g.nome ?? "",
          descricao: g.descricao ?? "",
          exercise_ids: g.exercise_ids ?? [],
        }))
      );
    }
  }, [dbGroups]);

  const exerciseMap = useMemo(() => {
    const m = new Map<string, ExerciseLite>();
    exercises.forEach((e) => m.set(e.id, e));
    return m;
  }, [exercises]);

  // Compute which exercises are unassigned
  const assignedIds = useMemo(() => {
    const s = new Set<string>();
    groups.forEach((g) => g.exercise_ids.forEach((id) => s.add(id)));
    return s;
  }, [groups]);

  const unassignedCount = exercises.length - assignedIds.size;

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups.map((g, i) => ({ g, i }));
    return groups
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => {
        if (g.nome.toLowerCase().includes(q)) return true;
        return g.exercise_ids.some((id) =>
          exerciseMap.get(id)?.nome.toLowerCase().includes(q)
        );
      });
  }, [groups, search, exerciseMap]);

  const toggleExpanded = (i: number) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  };

  const updateGroup = (i: number, patch: Partial<VariationGroup>) => {
    setGroups((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch, _dirty: true } : g)));
  };

  const addGroup = () => {
    setGroups((prev) => [
      { nome: "Novo grupo", descricao: "", exercise_ids: [], _new: true, _dirty: true },
      ...prev,
    ]);
    setExpanded((prev) => {
      const n = new Set<number>();
      // shift indexes
      prev.forEach((x) => n.add(x + 1));
      n.add(0);
      return n;
    });
  };

  const removeGroup = (i: number) => {
    const g = groups[i];
    if (g.id) {
      // mark for deletion by removing locally; will be deleted on save via diff
      setGroups((prev) => prev.filter((_, idx) => idx !== i));
      setDeletedIds((prev) => [...prev, g.id!]);
    } else {
      setGroups((prev) => prev.filter((_, idx) => idx !== i));
    }
  };

  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const removeExFromGroup = (gi: number, exId: string) => {
    updateGroup(gi, { exercise_ids: groups[gi].exercise_ids.filter((id) => id !== exId) });
  };

  const addExToGroup = (gi: number, exId: string) => {
    if (groups[gi].exercise_ids.includes(exId)) return;
    updateGroup(gi, { exercise_ids: [...groups[gi].exercise_ids, exId] });
  };

  const runAi = async () => {
    setLoadingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("organize-exercise-variations", {
        body: {
          exercises: exercises.map((e) => ({
            id: e.id,
            nome: e.nome,
            grupo_muscular: e.grupo_muscular,
          })),
          existingGroups: groups.map((g) => ({ nome: g.nome, exercise_ids: g.exercise_ids })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const suggested: VariationGroup[] = (data?.groups ?? []).map((g: any) => ({
        nome: g.nome,
        descricao: g.descricao ?? "",
        exercise_ids: g.exercise_ids ?? [],
        _new: true,
        _dirty: true,
      }));
      if (suggested.length === 0) {
        toast.info("IA não sugeriu novos grupos.");
        return;
      }
      // Merge: replace groups that have the same name (case-insensitive); add the rest
      setGroups((prev) => {
        const map = new Map(prev.map((g) => [g.nome.trim().toLowerCase(), g] as const));
        suggested.forEach((s) => {
          const key = s.nome.trim().toLowerCase();
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...existing, descricao: s.descricao || existing.descricao, exercise_ids: s.exercise_ids, _dirty: true });
          } else {
            map.set(key, s);
          }
        });
        return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
      });
      toast.success(`IA sugeriu ${suggested.length} grupos. Revise e salve.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar sugestões.");
    } finally {
      setLoadingAi(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      // Validate
      for (const g of groups) {
        if (!g.nome.trim()) {
          throw new Error("Todos os grupos precisam de um nome.");
        }
      }
      // Delete removed
      if (deletedIds.length > 0) {
        const { error } = await supabase
          .from("exercise_variation_groups")
          .delete()
          .in("id", deletedIds);
        if (error) throw error;
      }
      // Upsert: separate new vs existing
      const toInsert = groups
        .filter((g) => !g.id)
        .map((g) => ({
          nome: g.nome.trim(),
          descricao: g.descricao.trim() || null,
          exercise_ids: g.exercise_ids,
        }));
      const toUpdate = groups.filter((g) => g.id && g._dirty);

      if (toInsert.length > 0) {
        const { error } = await supabase.from("exercise_variation_groups").insert(toInsert);
        if (error) throw error;
      }
      for (const g of toUpdate) {
        const { error } = await supabase
          .from("exercise_variation_groups")
          .update({
            nome: g.nome.trim(),
            descricao: g.descricao.trim() || null,
            exercise_ids: g.exercise_ids,
          })
          .eq("id", g.id!);
        if (error) throw error;
      }
      setDeletedIds([]);
      await qc.invalidateQueries({ queryKey: ["exercise-variation-groups"] });
      toast.success("Variações salvas.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const pickerExercises = useMemo(() => {
    if (pickerIdx === null) return [];
    const current = new Set(groups[pickerIdx]?.exercise_ids ?? []);
    const q = pickerSearch.trim().toLowerCase();
    return exercises
      .filter((e) => !current.has(e.id))
      .filter((e) =>
        !q ||
        e.nome.toLowerCase().includes(q) ||
        e.grupo_muscular.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [pickerIdx, pickerSearch, exercises, groups]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Grupos de variações de exercícios</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Organize exercícios em grupos para que a IA possa variar entre eles ao gerar treinos.
            Ex: "Afundo" pode conter Afundo halteres, Afundo Smith, Búlgaro, Afundo dois steps.
          </p>
        </DialogHeader>

        <div className="px-6 py-3 border-y bg-muted/30 flex flex-wrap gap-2 items-center">
          <Button onClick={runAi} disabled={loadingAi || loadingExs} size="sm" className="gap-2">
            {loadingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loadingAi ? "Organizando..." : "Sugerir / atualizar com IA"}
          </Button>
          <Button onClick={addGroup} size="sm" variant="outline" className="gap-2">
            <Plus className="h-4 w-4" /> Novo grupo manual
          </Button>
          <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
            <span>{groups.length} grupos</span>
            <span>•</span>
            <span>{exercises.length - unassignedCount}/{exercises.length} exercícios agrupados</span>
          </div>
        </div>

        <div className="px-6 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar grupo ou exercício..."
              className="pl-9 h-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-2 py-3">
            {loadingGroups ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : filteredGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum grupo. Clique em "Sugerir com IA" ou "Novo grupo manual".
              </p>
            ) : (
              filteredGroups.map(({ g, i }) => {
                const isOpen = expanded.has(i);
                return (
                  <Card key={g.id ?? `new-${i}`} className="overflow-hidden">
                    <div
                      className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted/30"
                      onClick={() => toggleExpanded(i)}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {g.nome || <span className="italic text-muted-foreground">sem nome</span>}
                          {g._new && (
                            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-500">
                              novo
                            </Badge>
                          )}
                          {g._dirty && !g._new && (
                            <Badge variant="outline" className="text-[10px] border-blue-500/50 text-blue-500">
                              modificado
                            </Badge>
                          )}
                        </div>
                        {g.descricao && (
                          <p className="text-xs text-muted-foreground truncate">{g.descricao}</p>
                        )}
                      </div>
                      <Badge variant="secondary">{g.exercise_ids.length}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeGroup(i);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {isOpen && (
                      <CardContent className="border-t bg-muted/10 space-y-3 p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Nome do grupo</Label>
                            <Input
                              value={g.nome}
                              onChange={(e) => updateGroup(i, { nome: e.target.value })}
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Descrição</Label>
                            <Input
                              value={g.descricao}
                              onChange={(e) => updateGroup(i, { descricao: e.target.value })}
                              placeholder="Padrão de movimento..."
                              className="h-8"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <Label className="text-xs">Exercícios no grupo</Label>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1"
                              onClick={() => {
                                setPickerIdx(i);
                                setPickerSearch("");
                              }}
                            >
                              <Plus className="h-3 w-3" /> Adicionar
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {g.exercise_ids.length === 0 && (
                              <span className="text-xs text-muted-foreground italic">
                                Nenhum exercício. Clique em "Adicionar".
                              </span>
                            )}
                            {g.exercise_ids.map((id) => {
                              const ex = exerciseMap.get(id);
                              return (
                                <Badge
                                  key={id}
                                  variant="secondary"
                                  className="gap-1 pr-1"
                                >
                                  {ex?.nome ?? `ID ${id.slice(0, 6)}…`}
                                  <button
                                    onClick={() => removeExFromGroup(i, id)}
                                    className="hover:bg-muted-foreground/20 rounded-sm"
                                    aria-label="Remover"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Fechar
          </Button>
          <Button onClick={saveAll} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar variações
          </Button>
        </DialogFooter>

        {/* Exercise picker sub-dialog */}
        <Dialog open={pickerIdx !== null} onOpenChange={(o) => !o && setPickerIdx(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Adicionar exercícios ao grupo</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Buscar exercício..."
                className="pl-9"
              />
            </div>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-1 py-2">
                {pickerExercises.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum exercício disponível.
                  </p>
                ) : (
                  pickerExercises.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => {
                        if (pickerIdx !== null) addExToGroup(pickerIdx, ex.id);
                      }}
                      className="w-full flex items-center justify-between gap-2 p-2 rounded hover:bg-muted text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{ex.nome}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {ex.grupo_muscular}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPickerIdx(null)}>
                Concluir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
};

export default ExerciseVariationsDialog;