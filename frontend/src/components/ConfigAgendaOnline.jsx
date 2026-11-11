import { useEffect, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { api, getUser } from '../lib/api';
import { Alerta, Campo, Skeleton, Spinner } from './ui';

/**
 * Configuração do agendamento online: liga a página pública
 * /agendar/<slug> e define a grade de horários que o cliente vê.
 * O link vai no campo "Agendamento" do Perfil da Empresa no Google.
 */

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function ConfigAgendaOnline() {
  const slug = getUser()?.oficina_slug;
  const link = `${window.location.origin}/agendar/${slug}`;
  const [cfg, setCfg] = useState(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    api.configAgendaOnline().then(setCfg).catch((e) => setErro(e.message));
  }, []);

  const set = (campo) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setCfg((c) => ({ ...c, [campo]: v }));
  };

  function alternaDia(d) {
    setCfg((c) => ({
      ...c,
      dias: c.dias.includes(d) ? c.dias.filter((x) => x !== d) : [...c.dias, d].sort(),
    }));
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro(''); setOk('');
    try {
      const novo = await api.salvarConfigAgendaOnline(cfg);
      setCfg(novo);
      setOk(novo.ativo ? 'Salvo. A página de agendamento está no ar.' : 'Salvo. A página está desligada.');
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* navegador sem permissão: o link está visível pra copiar à mão */ }
  }

  if (!cfg) return erro ? <Alerta tipo="erro">{erro}</Alerta> : <Skeleton className="h-[420px]" />;

  return (
    <form onSubmit={salvar} className="space-y-5">
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {ok && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}

      <div className={`card border-l-4 p-5 ${cfg.ativo ? 'border-l-emerald-500' : 'border-l-slate-300'}`}>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5" checked={cfg.ativo} onChange={set('ativo')} />
          <span className="font-display text-sm font-semibold uppercase tracking-wide">
            Clientes podem agendar pela internet
          </span>
        </label>
        <p className="mt-2 text-xs text-slate-600">
          O cliente escolhe dia e horário livres, informa nome, WhatsApp e carro, e o pedido entra
          direto na <b>Agenda</b> com o selo <b>online</b>. Se o WhatsApp da oficina estiver conectado,
          o cliente recebe a confirmação e o número de alertas recebe o aviso.
        </p>

        <div className="mt-4">
          <span className="label mb-1.5 block">Link de agendamento</span>
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-xs" value={link} readOnly
              onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-ghost" onClick={copiar}>
              <Copy size={14} /> {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <a className="btn-ghost" href={`#/agendar/${slug}`} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Ver
            </a>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="titulo-secao">Botão "Agendar" no Google</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Ligue a opção acima e salve.</li>
          <li>No Google, pesquise o nome da oficina logado na conta dona do perfil
            (ou abra <b>business.google.com</b>).</li>
          <li>Clique em <b>Editar perfil</b> → <b>Contato</b> → <b>Links de agendamento</b>
            (em alguns perfis aparece como <b>Reservas</b>).</li>
          <li>Cole o link acima e salve. O Google pode levar alguns dias pra mostrar o botão.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          Dá pra usar o mesmo link na bio do Instagram e na mensagem automática do WhatsApp.
        </p>
      </div>

      <div className="card space-y-4 p-5">
        <h2 className="titulo-secao">Horários que aparecem pro cliente</h2>

        <div>
          <span className="label mb-1.5 block">Dias de atendimento</span>
          <div className="flex flex-wrap gap-2">
            {DIAS.map((nome, d) => (
              <button key={d} type="button" onClick={() => alternaDia(d)} aria-pressed={cfg.dias.includes(d)}
                className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition
                  ${cfg.dias.includes(d)
                    ? 'border-maninho-600 bg-maninho-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600'}`}>
                {nome}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo label="Abre às" obrigatorio>
            <input type="time" className="input" value={cfg.inicio} onChange={set('inicio')} required />
          </Campo>
          <Campo label="Fecha às" obrigatorio>
            <input type="time" className="input" value={cfg.fim} onChange={set('fim')} required />
          </Campo>
          <Campo label="Sábado fecha às" ajuda="Vazio = mesmo horário dos outros dias.">
            <input type="time" className="input" value={cfg.sabado_fim} onChange={set('sabado_fim')} />
          </Campo>
          <Campo label="Pausa (início)" ajuda="Vazio = sem pausa.">
            <input type="time" className="input" value={cfg.almoco_inicio} onChange={set('almoco_inicio')} />
          </Campo>
          <Campo label="Pausa (fim)">
            <input type="time" className="input" value={cfg.almoco_fim} onChange={set('almoco_fim')} />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Campo label="Intervalo" ajuda="Minutos entre um horário e outro.">
            <select className="input" value={cfg.intervalo} onChange={set('intervalo')}>
              {[30, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </Campo>
          <Campo label="Carros por horário" ajuda="Quantos atende ao mesmo tempo.">
            <input type="number" min={1} max={20} className="input" value={cfg.vagas} onChange={set('vagas')} />
          </Campo>
          <Campo label="Antecedência" ajuda="Horas mínimas antes do horário.">
            <input type="number" min={0} max={168} className="input" value={cfg.antecedencia_h}
              onChange={set('antecedencia_h')} />
          </Campo>
          <Campo label="Até quantos dias" ajuda="Quanto à frente dá pra marcar.">
            <input type="number" min={1} max={90} className="input" value={cfg.dias_max} onChange={set('dias_max')} />
          </Campo>
        </div>

        <Campo label="Recado na página (opcional)" ajuda="Ex.: Traga o carro com 15 min de antecedência.">
          <input className="input" maxLength={300} value={cfg.mensagem} onChange={set('mensagem')} />
        </Campo>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando && <Spinner className="h-4 w-4" />} Salvar
        </button>
      </div>
    </form>
  );
}
