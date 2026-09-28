import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

const TIPO_LABEL = {
  manutencao: '🔧 Manutenção',
  reativacao: '💤 Reativação',
  promocao:   '📢 Promoção',
  avaliacao:  '⭐ Avaliação',
};

function FormRegra({ aberto, regra, servicos, onFechar, onSalvo }) {
  const vazio = {
    nome: '', tipo: 'manutencao', servico_id: '',
    intervalo_dias: '180', mensagem_template: '', ativo: true,
  };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [iaConfigurada, setIaConfigurada] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const [sugestao, setSugestao] = useState(null);

  useEffect(() => {
    setErro(''); setSugestao(null);
    setForm(regra ? {
      ...vazio, ...regra,
      servico_id: regra.servico_id || '',
      intervalo_dias: String(regra.intervalo_dias),
    } : vazio);
    if (aberto) api.iaStatus().then((s) => setIaConfigurada(s.configurada)).catch(() => {});
  }, [regra, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function inserirVar(v) {
    setForm((f) => ({ ...f, mensagem_template: f.mensagem_template + v }));
  }

  // IA analisa o padrão real de retorno do serviço e sugere intervalo + template.
  async function sugerirRecorrencia() {
    if (!form.servico_id) { setErro('Selecione o serviço antes de sugerir'); return; }
    setSugerindo(true); setErro(''); setSugestao(null);
    try {
      const r = await api.iaSugerirRecorrencia(form.servico_id);
      setForm((f) => ({
        ...f,
        intervalo_dias: String(r.intervalo_dias),
        mensagem_template: f.mensagem_template.trim() ? f.mensagem_template : r.mensagem_template,
      }));
      setSugestao(r);
    } catch (e) { setErro(e.message); }
    finally { setSugerindo(false); }
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const body = {
        nome: form.nome,
        tipo: form.tipo,
        servico_id: form.tipo === 'manutencao' ? (form.servico_id || null) : null,
        intervalo_dias: Number(form.intervalo_dias),
        mensagem_template: form.mensagem_template,
        ativo: form.ativo === true || form.ativo === 'true',
      };
      const r = regra
        ? await api.atualizarFollowupRegra(regra.id, body)
        : await api.criarFollowupRegra(body);
      onSalvo(r);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  // Preview com dados fictícios
  const preview = form.mensagem_template
    .replace(/\{nome_cliente\}/g, 'João')
    .replace(/\{modelo_carro\}/g, 'VW Gol')
    .replace(/\{placa\}/g, 'ABC1D23')
    .replace(/\{servico\}/g, 'Troca de óleo')
    .replace(/\{dias_desde\}/g, '182');

  return (
    <Modal aberto={aberto} largura="max-w-2xl"
      titulo={regra ? `Editar regra` : 'Nova regra'} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')} required
            placeholder="Ex: Troca de óleo — 6 meses" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Tipo" obrigatorio>
            <select className="input" value={form.tipo} onChange={set('tipo')}>
              <option value="manutencao">Manutenção</option>
              <option value="reativacao">Reativação</option>
              <option value="promocao">Promoção</option>
              <option value="avaliacao">Avaliação</option>
            </select>
          </Campo>
          <Campo label="Intervalo (dias)" obrigatorio>
            <input type="number" className="input" min="7" max="730"
              value={form.intervalo_dias} onChange={set('intervalo_dias')} required />
          </Campo>
          <Campo label="Ativo">
            <select className="input" value={form.ativo} onChange={set('ativo')}>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </Campo>
        </div>

        {form.tipo === 'manutencao' && (
          <Campo label="Serviço vinculado" obrigatorio ajuda="OSs com esse serviço geram follow-up">
            <select className="input" value={form.servico_id} onChange={set('servico_id')} required>
              <option value="">Selecione…</option>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
            {iaConfigurada && (
              <div className="mt-2">
                <button type="button" onClick={sugerirRecorrencia}
                  disabled={sugerindo || !form.servico_id}
                  className="btn-ghost px-3 py-1 text-xs"
                  title="A IA analisa quando os clientes realmente voltam pra sugerir o intervalo">
                  {sugerindo ? <><Spinner className="h-3 w-3" /> Analisando retornos…</> : '🔮 Sugerir recorrência com IA'}
                </button>
              </div>
            )}
            {sugestao && (
              <div className="mt-2 rounded-md border border-maninho-200 bg-maninho-50/40 p-3 text-xs">
                <p className="font-semibold text-maninho-800">
                  Sugestão: {sugestao.intervalo_dias} dias
                </p>
                {sugestao.justificativa && (
                  <p className="mt-1 italic text-maninho-700">💡 {sugestao.justificativa}</p>
                )}
                <p className="mt-1 text-[11px] text-slate-500">
                  {sugestao.amostra?.amostras > 0
                    ? `Baseado em ${sugestao.amostra.amostras} retorno(s) reais · mediana ${sugestao.amostra.mediana_dias} dias (de ${sugestao.amostra.min_dias} a ${sugestao.amostra.max_dias}).`
                    : 'Poucos dados reais — sugestão baseada em conhecimento de mercado.'}
                </p>
                {sugestao.mensagem_template && form.mensagem_template.trim() !== sugestao.mensagem_template && (
                  <button type="button"
                    onClick={() => setForm((f) => ({ ...f, mensagem_template: sugestao.mensagem_template }))}
                    className="btn-ghost mt-2 px-2 py-0.5 text-[11px]">
                    ↧ Usar o template sugerido
                  </button>
                )}
              </div>
            )}
          </Campo>
        )}

        <Campo label="Mensagem" obrigatorio
          ajuda="Variáveis disponíveis abaixo — clique pra inserir">
          <div className="mb-2 flex flex-wrap gap-1">
            {['{nome_cliente}', '{modelo_carro}', '{placa}', '{servico}', '{dias_desde}'].map((v) => (
              <button key={v} type="button" onClick={() => inserirVar(v)}
                className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700 hover:bg-slate-200">
                {v}
              </button>
            ))}
          </div>
          <textarea className="input min-h-[180px] resize-y font-mono text-sm"
            value={form.mensagem_template} onChange={set('mensagem_template')}
            required minLength={10} maxLength={2000} />
        </Campo>

        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Preview</p>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{preview || '—'}</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function FollowupRegras() {
  const [regras, setRegras] = useState(null);
  const [servicos, setServicos] = useState([]);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  function carregar() {
    setErro('');
    Promise.all([api.followupRegras(), api.servicos()])
      .then(([r, s]) => { setRegras(r); setServicos(s); })
      .catch((e) => setErro(e.message));
  }
  useEffect(carregar, []);

  async function desativar(regra) {
    if (!confirm(`Desativar a regra "${regra.nome}"?`)) return;
    try { await api.removerFollowupRegra(regra.id); carregar(); }
    catch (e) { setErro(e.message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Regras de Follow-up
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            <Link to="/followup" className="hover:underline">← Voltar pra fila</Link>
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditando(null); setAberto(true); }}>
          + Nova regra
        </button>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!regras ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : regras.length === 0 ? (
        <Vazio titulo="Nenhuma regra cadastrada" descricao="Crie a primeira regra pra começar." />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {regras.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 px-4 py-3 ${r.ativo ? '' : 'opacity-50'}`}>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">
                    {TIPO_LABEL[r.tipo]} · {r.nome}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.tipo === 'manutencao' && r.servico_nome && `Serviço: ${r.servico_nome} · `}
                    Intervalo: {r.intervalo_dias} dias
                    {!r.ativo && ' · (inativa)'}
                  </p>
                </div>
                <button onClick={() => { setEditando(r); setAberto(true); }}
                  className="rounded px-2 py-1 text-xs font-semibold text-maninho-600 hover:bg-maninho-50">
                  Editar
                </button>
                {r.ativo && (
                  <button onClick={() => desativar(r)}
                    className="rounded px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                    Desativar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <FormRegra aberto={aberto} regra={editando} servicos={servicos}
        onFechar={() => { setAberto(false); setEditando(null); }}
        onSalvo={() => { setAberto(false); setEditando(null); carregar(); }} />
    </div>
  );
}
