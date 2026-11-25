import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, Eye, EyeOff, Lock, Mail, Phone, Ruler, Scale, User, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dados, forcaSenha, imc, metadadosCadastro, validarEtapa } from '@/lib/cadastro/validacao';
import './cadastro.css';

const PASSOS = ['Conta', 'Corpo', 'Treino', 'Objetivo'];
const TITULOS: [string, string, string][] = [
  ['Crie sua', 'conta', 'Seus dados de acesso ao app.'],
  ['Sobre o seu', 'corpo', 'Pra calcular calorias e montar sua dieta.'],
  ['Sua', 'rotina', 'Pra montar o treino no volume certo.'],
  ['Seu', 'objetivo', 'Último passo.'],
];
const PAISES = [['+351', '🇵🇹 +351'], ['+55', '🇧🇷 +55'], ['+33', '🇫🇷 +33'], ['+46', '🇸🇪 +46']];
const CORES = ['#ff5a5a', '#ff9f43', '#FBCF16', '#3ddc84'];

const inicial: Dados = { nome: '', email: '', ddi: '+351', telefone: '', senha: '', sexo: '', nascimento: '', altura: '', peso: '',
  tempo: '', dias: '', local: '', objetivo: '', lesoes: '', termos: false };

function Chips({ opcoes, valor, onChange }: { opcoes: [string, string][]; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="chips">
      {opcoes.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export default function Cadastro() {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState(1);
  const [d, setD] = useState<Dados>(inicial);
  const [erro, setErro] = useState<{ msg: string; campo?: string } | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<null | { logado: boolean }>(null);

  const set = <K extends keyof Dados>(k: K, v: Dados[K]) => { setD((p) => ({ ...p, [k]: v })); setErro(null); };
  const forca = forcaSenha(d.senha);
  const valorImc = useMemo(() => imc(d.altura, d.peso), [d.altura, d.peso]);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const cls = (c: string) => `campo${erro?.campo === c ? ' erro' : ''}`;

  const avancar = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validarEtapa(etapa, d);
    if (v) { setErro(v); return; }
    if (etapa < 4) { setEtapa(etapa + 1); return; }
    setEnviando(true);
    const { data, error } = await supabase.auth.signUp({
      email: d.email.trim().toLowerCase(),
      password: d.senha,
      options: { emailRedirectTo: window.location.origin, data: { nome: d.nome.trim(), role: 'aluno', cadastro: metadadosCadastro(d) } },
    });
    setEnviando(false);
    if (error) {
      setErro({ msg: /already|registered/i.test(error.message) ? 'Este e-mail já tem conta. Tente entrar.' : 'Não foi possível criar a conta. Tente novamente.' });
      return;
    }
    setFeito({ logado: !!data.session });
  };

  const [t1, t2, sub] = TITULOS[etapa - 1];

  return (
    <div className="cad">
      <main className="card">
        <div className="hero">
          <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1000&q=80" alt="" />
          <div className="marca"><span className="selo">App de treino e dieta</span><h1>MAROMBIEW</h1></div>
        </div>
        <div className="corpo">
          {feito ? (
            <div className="sucesso">
              <div className="check"><Check size={36} strokeWidth={3} /></div>
              <h2>Conta <span>criada</span></h2>
              <p className="sub">Tudo certo! Seu treino e sua dieta vão ser montados a partir dessas informações.</p>
              {!feito.logado && <p className="sub" style={{ marginTop: -8 }}>Confirme seu e-mail pelo link que enviamos e depois entre.</p>}
              <button type="button" className="botao" onClick={() => navigate(feito.logado ? '/minha-area' : '/login', { replace: true })}>Acessar conta</button>
            </div>
          ) : (
            <>
              <div className="passos">
                {PASSOS.map((p, i) => (
                  <div key={p} style={{ display: 'contents' }}>
                    {i > 0 && <div className={`linha${etapa > i ? ' feita' : ''}`} />}
                    <div className={`passo${etapa === i + 1 ? ' ativo' : etapa > i + 1 ? ' feito' : ''}`}>
                      <div className="bolinha">{etapa > i + 1 ? <Check size={14} strokeWidth={3} /> : i + 1}</div>
                      <small>{p}</small>
                    </div>
                  </div>
                ))}
              </div>
              <h2>{t1} <span>{t2}</span></h2>
              <p className="sub">{sub}</p>

              <form onSubmit={avancar} noValidate>
                <div className="etapa" key={etapa}>
                  {etapa === 1 && <>
                    <div className={cls('nome')}><User /><input placeholder="Nome completo" autoComplete="name" value={d.nome} onChange={(e) => set('nome', e.target.value)} /></div>
                    <div className={cls('email')}><Mail /><input type="email" placeholder="E-mail" autoComplete="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></div>
                    <div className="dupla tel">
                      <div className="campo"><select aria-label="País" value={d.ddi} onChange={(e) => set('ddi', e.target.value)}>{PAISES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                      <div className={cls('telefone')}><Phone /><input type="tel" inputMode="tel" placeholder="Telefone" autoComplete="tel-national" style={{ padding: '0 14px 0 40px' }} value={d.telefone} onChange={(e) => set('telefone', e.target.value)} /></div>
                    </div>
                    <div className={cls('senha')}><Lock /><input type={verSenha ? 'text' : 'password'} placeholder="Senha (mín. 8)" autoComplete="new-password" value={d.senha} onChange={(e) => set('senha', e.target.value)} />
                      <button type="button" className="olho" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
                    <div className="forca">{[0, 1, 2, 3].map((i) => <i key={i} style={{ background: d.senha && i < Math.max(forca, 1) ? CORES[Math.max(forca, 1) - 1] : undefined }} />)}</div>
                  </>}
                  {etapa === 2 && <>
                    <div className="rotulo">Sexo</div>
                    <Chips opcoes={[['feminino', 'Feminino'], ['masculino', 'Masculino']]} valor={d.sexo} onChange={(v) => set('sexo', v)} />
                    <div className="rotulo">Data de nascimento</div>
                    <div className={cls('nascimento')}><Calendar /><input type="date" max={hojeIso} value={d.nascimento} onChange={(e) => set('nascimento', e.target.value)} /></div>
                    <div className="dupla">
                      <div className={cls('altura')}><Ruler style={{ left: 12 }} /><input inputMode="decimal" placeholder="Altura" value={d.altura} onChange={(e) => set('altura', e.target.value)} /><span className="unidade">cm</span></div>
                      <div className={cls('peso')}><Scale style={{ left: 12 }} /><input inputMode="decimal" placeholder="Peso" value={d.peso} onChange={(e) => set('peso', e.target.value)} /><span className="unidade">kg</span></div>
                    </div>
                    {valorImc && <div className="imc">IMC estimado: <b>{valorImc.toFixed(1).replace('.', ',')}</b></div>}
                  </>}
                  {etapa === 3 && <>
                    <div className="rotulo">Há quanto tempo treina?</div>
                    <Chips opcoes={[['parado', 'Tô parado(a)'], ['<6m', 'Menos de 6 meses'], ['6m-2a', '6 meses a 2 anos'], ['>2a', 'Mais de 2 anos']].map(([, l]) => [l, l]) as [string, string][]} valor={d.tempo} onChange={(v) => set('tempo', v)} />
                    <div className="rotulo">Dias de treino por semana</div>
                    <Chips opcoes={['2', '3', '4', '5', '6'].map((n) => [n, n]) as [string, string][]} valor={d.dias} onChange={(v) => set('dias', v)} />
                    <div className="rotulo">Onde treina?</div>
                    <Chips opcoes={[['Ginásio / academia', 'Ginásio / academia'], ['Em casa', 'Em casa']]} valor={d.local} onChange={(v) => set('local', v)} />
                  </>}
                  {etapa === 4 && <>
                    <div className="rotulo">Seu objetivo</div>
                    <Chips opcoes={['Perder gordura', 'Ganhar massa', 'Condicionamento'].map((o) => [o, o]) as [string, string][]} valor={d.objetivo} onChange={(v) => set('objetivo', v)} />
                    <div className="campo"><Activity /><input placeholder="Alguma dor ou lesão? (opcional)" maxLength={500} value={d.lesoes} onChange={(e) => set('lesoes', e.target.value)} /></div>
                    <label className="termos"><input type="checkbox" checked={d.termos} onChange={(e) => set('termos', e.target.checked)} />Aceito os termos de uso</label>
                  </>}
                  <div className="msg-erro" role="alert">{erro?.msg}</div>
                  <div className="acoes">
                    {etapa > 1 && <button type="button" className="voltar" aria-label="Voltar" onClick={() => { setErro(null); setEtapa(etapa - 1); }}><ArrowLeft size={20} /></button>}
                    <button type="submit" className="botao" disabled={enviando}>{etapa === 4 ? (enviando ? 'Criando...' : 'Criar conta') : 'Continuar'}</button>
                  </div>
                </div>
              </form>
              {etapa === 1 && <p className="rodape">Já tem conta? <Link to="/login">Entrar</Link></p>}
            </>
          )}
          <p className="assina">MAROMBIEW · @marombiew</p>
        </div>
      </main>
    </div>
  );
}
