import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alerta, Campo, Modal, Skeleton, Spinner, Vazio } from '../components/ui';

const ROTULO_ESCOPO = { oficina: 'Oficina', pessoal: 'Pessoal', ambos: 'Ambos' };
const CORES_SUGERIDAS = [
  '#2B3D8F', '#7c3aed', '#0891b2', '#ea580c', '#D4A843',
  '#dc2626', '#65a30d', '#db2777', '#0d9488', '#64748b',
];

/**
 * CRUD de categorias de despesa. Lista todas (inclui inativas), com
 * filtro por escopo. Criar/editar/desativar via modal. Desativar é
 * soft-delete: mantém o histórico das despesas que já usam a categoria.
 */
function CategoriasDespesa() {
  const [categorias, setCategorias] = useState(null);
  const [filtroEscopo, setFiltroEscopo] = useState(''); // '', 'oficina', 'pessoal'
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  function carregar() {
    setErro('');
    api.categorias({ incluir_inativas: true })
      .then(setCategorias)
      .catch((e) => setErro(e.message));
  }
  useEffect(() => { carregar(); }, []);

  async function desativar(cat) {
    if (!confirm(`Desativar a categoria "${cat.nome}"? Ela some dos selects, mas as despesas que já a usam continuam com ela.`)) return;
    try {
      await api.desativarCategoria(cat.id);
      setOk(`Categoria "${cat.nome}" desativada.`);
      carregar();
    } catch (err) { setErro(err.message); }
  }

  async function reativar(cat) {
    try {
      await api.atualizarCategoria(cat.id, { ativo: true });
      setOk(`Categoria "${cat.nome}" reativada.`);
      carregar();
    } catch (err) { setErro(err.message); }
  }

  function abrirNovo() { setEditando(null); setModalAberto(true); }
  function abrirEdicao(c) { setEditando(c); setModalAberto(true); }
  function fechou(salvo) {
    setModalAberto(false);
    if (salvo) { setOk('Categoria salva.'); carregar(); }
  }

  const filtradas = (categorias || []).filter((c) => {
    if (!filtroEscopo) return true;
    return c.escopo === filtroEscopo || c.escopo === 'ambos';
  });

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="titulo-secao">Categorias de despesa</h2>
          <p className="mt-1 text-xs text-slate-500">
            Organize as despesas em categorias próprias. Cada categoria pode ser
            só da <b>oficina</b>, só <b>pessoal</b>, ou <b>ambas</b> — controlando
            o que aparece em cada tela de despesa.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={abrirNovo}>
          + Nova categoria
        </button>
      </div>

      <div className="mt-4 flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm w-fit">
        {[['', 'Todas'], ['oficina', 'Oficina'], ['pessoal', 'Pessoal']].map(([k, t]) => (
          <button key={k || 'all'} type="button" onClick={() => setFiltroEscopo(k)}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition
              ${filtroEscopo === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {t}
          </button>
        ))}
      </div>

      {erro && <div className="mt-3"><Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta></div>}
      {ok   && <div className="mt-3"><Alerta tipo="ok"   onFechar={() => setOk('')}>{ok}</Alerta></div>}

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        {!categorias ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : filtradas.length === 0 ? (
          <Vazio titulo="Nenhuma categoria" descricao="Clique em '+ Nova categoria' pra criar a primeira." />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="th w-10"></th>
                <th className="th">Nome</th>
                <th className="th w-32">Escopo</th>
                <th className="th w-20 text-right">Ordem</th>
                <th className="th w-32">Status</th>
                <th className="th w-40 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtradas.map((c) => (
                <tr key={c.id} className={c.ativo ? '' : 'opacity-60'}>
                  <td className="td">
                    <span className="inline-block h-4 w-4 rounded-full ring-1 ring-slate-200"
                      style={{ background: c.cor }} title={c.cor} />
                  </td>
                  <td className="td font-medium text-slate-800">{c.nome}</td>
                  <td className="td text-xs">
                    <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset
                      ${c.escopo === 'oficina' ? 'bg-maninho-50 text-maninho-800 ring-maninho-200'
                        : c.escopo === 'pessoal' ? 'bg-violet-50 text-violet-800 ring-violet-200'
                          : 'bg-slate-50 text-slate-700 ring-slate-200'}`}>
                      {ROTULO_ESCOPO[c.escopo] || c.escopo}
                    </span>
                  </td>
                  <td className="td tnum text-right text-xs text-slate-500">{c.ordem}</td>
                  <td className="td text-xs">
                    {c.ativo
                      ? <span className="text-emerald-700">Ativa</span>
                      : <span className="text-slate-500">Inativa</span>}
                  </td>
                  <td className="td text-right">
                    <button type="button" className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => abrirEdicao(c)}>Editar</button>
                    {c.ativo ? (
                      <button type="button"
                        className="ml-1 rounded bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        onClick={() => desativar(c)}>Desativar</button>
                    ) : (
                      <button type="button"
                        className="ml-1 rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        onClick={() => reativar(c)}>Reativar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FormCategoria aberto={modalAberto} categoria={editando}
        onFechar={() => setModalAberto(false)} onSalvo={() => fechou(true)} />
    </div>
  );
}

function FormCategoria({ aberto, categoria, onFechar, onSalvo }) {
  const vazio = { nome: '', cor: '#64748b', escopo: 'ambos', ordem: 100 };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setErro('');
    setForm(categoria
      ? { nome: categoria.nome, cor: categoria.cor, escopo: categoria.escopo, ordem: categoria.ordem }
      : vazio);
  }, [categoria, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro('');
    try {
      const body = {
        nome: form.nome.trim(),
        cor: form.cor,
        escopo: form.escopo,
        ordem: Number(form.ordem) || 100,
      };
      if (categoria) await api.atualizarCategoria(categoria.id, body);
      else await api.criarCategoria(body);
      onSalvo();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar}
      titulo={categoria ? `Editar categoria "${categoria.nome}"` : 'Nova categoria'}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')}
            required autoFocus minLength={2} placeholder="Ex.: Supermercado" />
        </Campo>

        <Campo label="Onde aparece" obrigatorio
          ajuda="Escolha onde essa categoria vai poder ser usada. 'Ambos' mostra nos dois lados.">
          <select className="input" value={form.escopo} onChange={set('escopo')}>
            <option value="oficina">Só na oficina</option>
            <option value="pessoal">Só nas despesas pessoais</option>
            <option value="ambos">Ambos (oficina e pessoal)</option>
          </select>
        </Campo>

        <Campo label="Cor" ajuda="Usada nos gráficos e badges. Escolha uma das sugestões ou digite hex.">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {CORES_SUGERIDAS.map((c) => (
                <button type="button" key={c}
                  onClick={() => setForm((f) => ({ ...f, cor: c }))}
                  className={`h-7 w-7 rounded-full ring-2 transition
                    ${form.cor === c ? 'ring-slate-800' : 'ring-transparent hover:ring-slate-400'}`}
                  style={{ background: c }} title={c} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input className="input font-mono text-sm w-32"
                value={form.cor} onChange={set('cor')}
                pattern="^#[0-9a-fA-F]{6}$" placeholder="#2B3D8F" />
              <span className="inline-block h-8 w-8 rounded ring-1 ring-slate-200"
                style={{ background: form.cor }} />
            </div>
          </div>
        </Campo>

        <Campo label="Ordem" ajuda="Menor = aparece primeiro nas listas. Default 100.">
          <input type="number" className="input tnum w-32" min="0" max="9999"
            value={form.ordem} onChange={set('ordem')} />
        </Campo>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : (categoria ? 'Salvar alterações' : 'Criar categoria')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Configurações do sistema — WhatsApp (Evolution API) + Meta mensal.
 * Só admin acessa (backend recusa com 403 pra não-admin; menu esconde).
 *
 * API key da Evolution vem mascarada do backend. Botão "Trocar"
 * destrava edição pra evitar sobrescrever por acidente.
 */

function CampoSecreto({ label, valorMascarado, valor, onChange, obrigatorio, ajuda }) {
  const [editando, setEditando] = useState(false);
  return (
    <Campo label={label} obrigatorio={obrigatorio} ajuda={ajuda}>
      <div className="flex gap-2">
        <input
          type={editando ? 'text' : 'password'}
          className="input flex-1 font-mono text-sm"
          placeholder={valorMascarado || '(não configurado)'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={!editando}
        />
        <button type="button" onClick={() => setEditando((v) => !v)}
          className="btn-ghost px-3 text-xs">
          {editando ? 'Cancelar' : (valorMascarado ? 'Trocar' : 'Definir')}
        </button>
      </div>
      {valorMascarado && !editando && (
        <p className="mt-1 text-[11px] text-slate-500">
          Guardado: <span className="font-mono">{valorMascarado}</span>. Clique em Trocar pra substituir.
        </p>
      )}
    </Campo>
  );
}

/** Bloco de conexão WhatsApp — status + QR code inline */
function BlocoConexao({ enabled }) {
  const [estado, setEstado] = useState(null);
  const [qr, setQr] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  async function ver() {
    setCarregando(true); setErro('');
    try {
      const e = await api.waConexao();
      setEstado(e);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }
  async function pegarQr() {
    setCarregando(true); setErro(''); setQr(null);
    try {
      const r = await api.waQrCode();
      setQr(r);
      const e = await api.waConexao();
      setEstado(e);
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }
  async function desconectar() {
    if (!confirm('Desconectar o WhatsApp? Vai precisar escanear o QR de novo.')) return;
    setCarregando(true); setErro('');
    try {
      await api.waDesconectar();
      setQr(null);
      await ver();
    } catch (err) { setErro(err.message); }
    finally { setCarregando(false); }
  }

  useEffect(() => { if (enabled) ver(); }, [enabled]);

  // Auto-refresh a cada 4s enquanto tem QR na tela — assim que conectar, atualiza
  useEffect(() => {
    if (!qr || !enabled) return;
    const t = setInterval(async () => {
      try {
        const e = await api.waConexao();
        setEstado(e);
        if (e.conectado) { setQr(null); }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(t);
  }, [qr, enabled]);

  if (!enabled) {
    return (
      <p className="text-xs text-slate-500">
        Preencha e salve URL, API key e nome da instância antes de conectar o WhatsApp.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {/* Status atual */}
      <div className="flex flex-wrap items-center gap-3">
        {estado ? (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold
            ${estado.conectado ? 'bg-emerald-100 text-emerald-800'
              : estado.estado === 'connecting' ? 'bg-ouro-100 text-ouro-800'
              : 'bg-slate-100 text-slate-700'}`}>
            {estado.conectado ? '✓ Conectado' : `Estado: ${estado.estado || 'desconhecido'}`}
          </span>
        ) : (
          <span className="text-xs text-slate-500">Verificando…</span>
        )}
        <button onClick={ver} disabled={carregando}
          className="btn-ghost px-3 py-1 text-xs">↻ Atualizar</button>
        {estado?.conectado ? (
          <button onClick={desconectar} disabled={carregando}
            className="rounded bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">
            Desconectar
          </button>
        ) : (
          <button onClick={pegarQr} disabled={carregando}
            className="btn-primary px-3 py-1 text-xs">
            {carregando ? '…' : (qr ? '↻ Gerar novo QR' : '📱 Conectar WhatsApp')}
          </button>
        )}
      </div>

      {qr && !estado?.conectado && (
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm text-slate-700">
            Abra o WhatsApp no celular → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>,
            e escaneie o código abaixo.
          </p>
          <div className="flex justify-center">
            {qr.base64 ? (
              <img src={qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`}
                alt="QR code do WhatsApp"
                className="h-64 w-64 rounded-md border border-slate-300" />
            ) : (
              <p className="text-sm text-rose-700">QR code não veio na resposta.</p>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-slate-500">
            A tela atualiza sozinha a cada 4s. Assim que conectar, o QR some.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Configuracoes() {
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState({ setup: {}, alerta: {}, meta: {} });
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregar(); }, []);

  function carregar() {
    setErro('');
    api.configWhatsApp()
      .then((d) => {
        setDados(d);
        setForm({ setup: {}, alerta: {}, meta: {} });
      })
      .catch((e) => setErro(e.message));
  }

  const set = (grupo, campo) => (v) =>
    setForm((f) => ({ ...f, [grupo]: { ...f[grupo], [campo]: v } }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro(''); setOk('');
    const body = {
      setup: { ...form.setup },
      alerta: { ...form.alerta },
      meta: { ...form.meta },
    };
    // api_key vazia = "não mexer" (não zera segredo por acidente)
    if (body.setup.api_key === '') delete body.setup.api_key;
    try {
      const atualizado = await api.salvarConfigWhatsApp(body);
      setDados(atualizado);
      setForm({ setup: {}, alerta: {}, meta: {} });
      setOk('Configurações salvas.');
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!dados) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  const v = (grupo, campo) =>
    form[grupo][campo] !== undefined ? form[grupo][campo] : (dados[grupo][campo] ?? '');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
          Configurações
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Ajuste WhatsApp (Evolution API), meta mensal e alertas internos.
        </p>
      </div>

      {/* Status geral */}
      <div className={`card p-4 border-l-4 ${dados.enabled ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
        <p className="font-display text-sm font-semibold uppercase tracking-wide">
          Status:{' '}
          {dados.enabled
            ? <span className="text-emerald-700">Evolution API configurada</span>
            : <span className="text-rose-700">WhatsApp NÃO configurado</span>}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Configurada não significa <b>conectada</b>. Depois de salvar URL + API key + instância,
          use o botão <b>Conectar WhatsApp</b> abaixo pra escanear o QR code no celular.
          Sem conexão ativa, todo envio falha silenciosamente.
        </p>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {ok   && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}

      <form onSubmit={salvar} className="space-y-5">
        {/* Setup Evolution */}
        <div className="card p-5">
          <h2 className="titulo-secao">Evolution API</h2>
          <p className="mb-4 text-xs text-slate-500">
            Provider self-hosted que substitui a Meta Cloud API — sem templates,
            sem janela de 24h, sem custo por mensagem. Se você está rodando pelo
            docker-compose deste projeto, os defaults abaixo já funcionam.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="URL da Evolution" obrigatorio
              ajuda="Dentro do compose = http://evolution:8080">
              <input className="input font-mono text-sm"
                value={v('setup', 'url')}
                onChange={(e) => set('setup', 'url')(e.target.value)}
                placeholder="http://evolution:8080" />
            </Campo>

            <Campo label="Nome da instância" obrigatorio
              ajuda="Aparece como 'aparelho conectado' no WhatsApp">
              <input className="input"
                value={v('setup', 'instance')}
                onChange={(e) => set('setup', 'instance')(e.target.value)}
                placeholder="oficina" />
            </Campo>

            <div className="sm:col-span-2">
              <CampoSecreto label="API key" obrigatorio
                valorMascarado={dados.setup.api_key}
                valor={form.setup.api_key ?? ''}
                onChange={set('setup', 'api_key')}
                ajuda="Chave global do Evolution (a mesma que está em EVOLUTION_API_KEY no .env)" />
            </div>
          </div>
        </div>

        {/* Alertas internos */}
        <div className="card p-5">
          <h2 className="titulo-secao">Alertas internos (dono da oficina)</h2>
          <p className="mb-4 text-xs text-slate-500">
            Onde e quando você recebe os avisos de contas a pagar. Este número
            NÃO é o da oficina — é o SEU celular pessoal.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Meu WhatsApp (E.164)"
              ajuda="Ex.: +5551998887777">
              <input className="input font-mono"
                value={v('alerta', 'whatsapp')}
                onChange={(e) => set('alerta', 'whatsapp')(e.target.value)}
                placeholder="+5551999999999" />
            </Campo>
            <Campo label="Hora do envio diário"
              ajuda="Hora do dia (0–23) em que o resumo é enviado.">
              <input type="number" min="0" max="23" className="input"
                value={v('alerta', 'hora')}
                onChange={(e) => set('alerta', 'hora')(e.target.value)}
                placeholder="8" />
            </Campo>
          </div>
        </div>

        {/* Meta mensal */}
        <div className="card p-5">
          <h2 className="titulo-secao">Meta de faturamento mensal</h2>
          <p className="mb-4 text-xs text-slate-500">
            Aparece no Painel como barra de progresso com projeção do fechamento.
            Deixe vazio pra esconder o bloco.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Meta mensal (R$)" ajuda="Ex.: 20000 = R$ 20.000">
              <input type="number" min="0" step="100" className="input tnum"
                value={v('meta', 'mensal')}
                onChange={(e) => set('meta', 'mensal')(e.target.value)}
                placeholder="20000" />
            </Campo>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={carregar}>
            Descartar alterações
          </button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Salvar configurações'}
          </button>
        </div>
      </form>

      {/* Categorias de despesa — fora do formulário, tem CRUD próprio */}
      <CategoriasDespesa />

      {/* Conexão do WhatsApp — fora do formulário porque não faz save */}
      <div className="card p-5">
        <h2 className="titulo-secao">Conexão do WhatsApp</h2>
        <p className="mb-4 text-xs text-slate-500">
          Depois de salvar as credenciais acima, conecte o número da oficina
          escaneando o QR code com o celular.
        </p>
        <BlocoConexao enabled={dados.enabled} />
      </div>
    </div>
  );
}
