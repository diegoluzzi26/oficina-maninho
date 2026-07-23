import { useEffect, useState, useCallback, useRef } from 'react';
import { api, getToken } from '../lib/api';
import { brl, data, dataHora, telefone, STATUS, nomeMes,
  FORMAS_PAGAMENTO, rotuloForma, hojeISO } from '../lib/format';
import { Badge, Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

/**
 * Anexo protegido por JWT: baixa via fetch (com Authorization) e
 * cria blob URL pra usar em <img>. Libera a URL ao desmontar.
 */
function AnexoImg({ id, alt, onClick, className }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let vivo = true;
    let blobUrl = '';
    fetch(api.urlDoAnexo(id), { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.blob())
      .then((b) => {
        if (!vivo) return;
        blobUrl = URL.createObjectURL(b);
        setUrl(blobUrl);
      })
      .catch(() => {});
    return () => { vivo = false; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [id]);
  if (!url) return <div className={`animate-pulse bg-slate-200 ${className}`} />;
  return <img src={url} alt={alt} className={className} onClick={onClick} />;
}

const FILTROS = [
  { chave: '', texto: 'Todas' },
  { chave: 'aberta', texto: 'Abertas' },
  { chave: 'em_andamento', texto: 'Em andamento' },
  { chave: 'finalizada', texto: 'Finalizadas' },
  { chave: 'paga', texto: 'Pagas' },
];

const PROXIMOS = {
  aberta: ['em_andamento', 'finalizada'],
  em_andamento: ['finalizada', 'aberta'],
  finalizada: ['paga', 'em_andamento'],
  paga: [],
};

// ---------------------------------------------------------------------
// Modal nova OS — cliente existente OU novo
// ---------------------------------------------------------------------
function NovaOS({ aberto, onFechar, onCriada }) {
  const [clientes, setClientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [modoCliente, setModoCliente] = useState('existente'); // 'existente' | 'novo'
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [carros, setCarros] = useState([]);
  const [carroId, setCarroId] = useState('');
  const [modoCarro, setModoCarro] = useState('existente'); // 'existente' | 'novo'

  // Formulário de novo cliente
  const [novoCliente, setNovoCliente] = useState({ nome: '', telefone: '', cpf_cnpj: '', email: '' });
  // Formulário de novo carro (usado quando cliente novo OU cliente existente sem carros)
  const [novoCarro, setNovoCarro] = useState({ placa: '', marca: '', modelo: '', ano: '', cor: '', km_atual: '' });

  const [km, setKm] = useState('');
  const [obs, setObs] = useState('');
  const [itens, setItens] = useState([]);
  const [pecas, setPecas] = useState([]);
  const [notificar, setNotificar] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Serviços do catálogo: carrega uma vez quando o modal abre.
  useEffect(() => {
    if (!aberto) return;
    api.servicos()
      .then(setServicos)
      .catch((e) => setErro(`Erro ao carregar catálogo: ${e.message}`));
  }, [aberto]);

  // Clientes: recarrega ao digitar na busca (com debounce), sem derrubar o resto.
  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => {
      api.clientes({ por_pagina: 100, busca: buscaCliente })
        .then((c) => setClientes(c.dados))
        .catch((e) => setErro(`Erro ao buscar clientes: ${e.message}`));
    }, buscaCliente ? 300 : 0);
    return () => clearTimeout(t);
  }, [aberto, buscaCliente]);

  useEffect(() => {
    if (modoCliente !== 'existente' || !clienteId) { setCarros([]); setCarroId(''); return; }
    api.cliente(clienteId)
      .then((c) => {
        setCarros(c.carros || []);
        setCarroId(c.carros?.length === 1 ? c.carros[0].id : '');
        setModoCarro(c.carros?.length ? 'existente' : 'novo');
      })
      .catch((e) => setErro(e.message));
  }, [clienteId, modoCliente]);

  function limpar() {
    setModoCliente('existente'); setBuscaCliente('');
    setClienteId(''); setCarroId(''); setKm(''); setObs('');
    setItens([]); setPecas([]); setNotificar(false); setErro('');
    setNovoCliente({ nome: '', telefone: '', cpf_cnpj: '', email: '' });
    setNovoCarro({ placa: '', marca: '', modelo: '', ano: '', cor: '', km_atual: '' });
    setModoCarro('existente');
  }

  function addServico() {
    const s = servicos[0];
    if (!s) return;
    setItens((v) => [...v, {
      servico_id: s.id, nome: s.nome, quantidade: 1, valor_unit: Number(s.valor_padrao),
    }]);
  }
  function trocarServico(idx, servicoId) {
    const s = servicos.find((x) => x.id === servicoId);
    setItens((v) => v.map((it, i) => (i === idx
      ? { ...it, servico_id: s.id, nome: s.nome, valor_unit: Number(s.valor_padrao) }
      : it)));
  }

  const totalServicos = itens.reduce((s, i) => s + (Number(i.valor_unit) || 0) * (Number(i.quantidade) || 0), 0);
  const totalPecas = pecas.reduce((s, p) => s + (Number(p.valor_unit) || 0) * (Number(p.quantidade) || 0), 0);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const body = {
        km_entrada: km ? Number(km) : null,
        observacoes: obs || null,
        servicos: itens.map((i) => ({
          servico_id: i.servico_id, quantidade: Number(i.quantidade), valor_unit: Number(i.valor_unit),
        })),
        pecas: pecas.map((p) => ({
          descricao: p.descricao, quantidade: Number(p.quantidade), valor_unit: Number(p.valor_unit),
        })),
        notificar_whatsapp: notificar,
      };
      if (modoCliente === 'existente') body.cliente_id = clienteId;
      else body.novo_cliente = novoCliente;

      if (modoCliente === 'novo' || modoCarro === 'novo') body.novo_carro = novoCarro;
      else body.carro_id = carroId;

      const os = await api.criarOS(body);
      limpar();
      onCriada(os);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  const clientePronto = modoCliente === 'existente' ? !!clienteId
    : !!(novoCliente.nome && novoCliente.telefone);
  const carroPronto = (modoCliente === 'novo' || modoCarro === 'novo')
    ? !!(novoCarro.placa && novoCarro.marca && novoCarro.modelo)
    : !!carroId;

  return (
    <Modal aberto={aberto} titulo="Nova ordem de serviço" largura="max-w-3xl"
      onFechar={() => { limpar(); onFechar(); }}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        {/* Cliente: toggle existente/novo */}
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Cliente</span>
            <div className="flex rounded border border-slate-300 p-0.5">
              {[['existente', 'Existente'], ['novo', 'Cadastrar novo']].map(([k, t]) => (
                <button key={k} type="button" onClick={() => setModoCliente(k)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition
                    ${modoCliente === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {modoCliente === 'existente' ? (
            <div className="space-y-2">
              <input className="input" placeholder="Buscar por nome, telefone, CPF ou nº…"
                value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
              <select className="input" value={clienteId} required
                onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Selecione…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>#{c.numero_cliente} — {c.nome}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nome" obrigatorio>
                <input className="input" value={novoCliente.nome} required
                  onChange={(e) => setNovoCliente({ ...novoCliente, nome: e.target.value })} />
              </Campo>
              <Campo label="Telefone" obrigatorio>
                <input className="input" value={novoCliente.telefone} required
                  placeholder="(51) 99888-7777"
                  onChange={(e) => setNovoCliente({ ...novoCliente, telefone: e.target.value })} />
              </Campo>
              <Campo label="CPF / CNPJ">
                <input className="input" value={novoCliente.cpf_cnpj}
                  onChange={(e) => setNovoCliente({ ...novoCliente, cpf_cnpj: e.target.value })} />
              </Campo>
              <Campo label="E-mail">
                <input type="email" className="input" value={novoCliente.email}
                  onChange={(e) => setNovoCliente({ ...novoCliente, email: e.target.value })} />
              </Campo>
            </div>
          )}
        </div>

        {/* Veículo */}
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Veículo</span>
            {modoCliente === 'existente' && carros.length > 0 && (
              <div className="flex rounded border border-slate-300 p-0.5">
                {[['existente', 'Existente'], ['novo', 'Cadastrar novo']].map(([k, t]) => (
                  <button key={k} type="button" onClick={() => setModoCarro(k)}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition
                      ${modoCarro === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {(modoCliente === 'novo' || modoCarro === 'novo') ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Placa" obrigatorio>
                <input className="input font-mono uppercase" value={novoCarro.placa} required
                  placeholder="ABC1D23"
                  onChange={(e) => setNovoCarro({ ...novoCarro, placa: e.target.value.toUpperCase() })} />
              </Campo>
              <Campo label="Marca" obrigatorio>
                <input className="input" value={novoCarro.marca} required
                  onChange={(e) => setNovoCarro({ ...novoCarro, marca: e.target.value })} />
              </Campo>
              <Campo label="Modelo" obrigatorio>
                <input className="input" value={novoCarro.modelo} required
                  onChange={(e) => setNovoCarro({ ...novoCarro, modelo: e.target.value })} />
              </Campo>
              <Campo label="Ano">
                <input type="number" min="1900" max="2100" className="input"
                  value={novoCarro.ano}
                  onChange={(e) => setNovoCarro({ ...novoCarro, ano: e.target.value })} />
              </Campo>
              <Campo label="Cor">
                <input className="input" value={novoCarro.cor}
                  onChange={(e) => setNovoCarro({ ...novoCarro, cor: e.target.value })} />
              </Campo>
              <Campo label="KM atual">
                <input type="number" min="0" className="input" value={novoCarro.km_atual}
                  onChange={(e) => setNovoCarro({ ...novoCarro, km_atual: e.target.value })} />
              </Campo>
            </div>
          ) : (
            <select className="input" value={carroId} required
              disabled={modoCliente === 'existente' && !clienteId}
              onChange={(e) => setCarroId(e.target.value)}>
              <option value="">
                {modoCliente === 'existente' && !clienteId ? 'Escolha o cliente antes' : 'Selecione…'}
              </option>
              {carros.map((c) => (
                <option key={c.id} value={c.id}>{c.placa} — {c.marca} {c.modelo}</option>
              ))}
            </select>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="KM de entrada">
            <input type="number" min="0" className="input" value={km}
              onChange={(e) => setKm(e.target.value)} placeholder="150000" />
          </Campo>
          <Campo label="Observações">
            <input className="input" value={obs} onChange={(e) => setObs(e.target.value)}
              placeholder="Cliente relatou falha ao dar partida" />
          </Campo>
        </div>

        {/* Serviços */}
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Serviços</span>
            <button type="button" onClick={addServico} className="btn-ghost px-2.5 py-1 text-xs">
              + Adicionar
            </button>
          </div>
          {itens.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">Nenhum serviço adicionado</p>
          ) : (
            <div className="space-y-2">
              {itens.map((it, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select className="input flex-1 min-w-[180px] py-1.5 text-xs"
                    value={it.servico_id} onChange={(e) => trocarServico(idx, e.target.value)}>
                    {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                  <input type="number" min="1" className="input w-16 py-1.5 text-xs" value={it.quantidade}
                    onChange={(e) => setItens((v) => v.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)))} />
                  <input type="number" step="0.01" min="0" className="input w-28 py-1.5 text-xs tnum"
                    value={it.valor_unit}
                    onChange={(e) => setItens((v) => v.map((x, i) => (i === idx ? { ...x, valor_unit: e.target.value } : x)))} />
                  <button type="button" onClick={() => setItens((v) => v.filter((_, i) => i !== idx))}
                    className="px-1.5 text-slate-400 transition hover:text-rose-600" title="Remover">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Peças */}
        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Peças</span>
            <button type="button"
              onClick={() => setPecas((v) => [...v, { descricao: '', quantidade: 1, valor_unit: '' }])}
              className="btn-ghost px-2.5 py-1 text-xs">+ Adicionar</button>
          </div>
          {pecas.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">Nenhuma peça adicionada</p>
          ) : (
            <div className="space-y-2">
              {pecas.map((p, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <input className="input flex-1 min-w-[180px] py-1.5 text-xs" placeholder="Descrição da peça"
                    value={p.descricao}
                    onChange={(e) => setPecas((v) => v.map((x, i) => (i === idx ? { ...x, descricao: e.target.value } : x)))} />
                  <input type="number" min="0.01" step="0.01" className="input w-16 py-1.5 text-xs" value={p.quantidade}
                    onChange={(e) => setPecas((v) => v.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)))} />
                  <input type="number" step="0.01" min="0" className="input w-28 py-1.5 text-xs tnum" placeholder="0,00"
                    value={p.valor_unit}
                    onChange={(e) => setPecas((v) => v.map((x, i) => (i === idx ? { ...x, valor_unit: e.target.value } : x)))} />
                  <button type="button" onClick={() => setPecas((v) => v.filter((_, i) => i !== idx))}
                    className="px-1.5 text-slate-400 transition hover:text-rose-600" title="Remover">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-maninho-50 px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-maninho-600 focus:ring-maninho-600/30" />
            Avisar cliente pelo WhatsApp
          </label>
          <p className="tnum text-sm">
            <span className="text-slate-500">Total </span>
            <span className="font-display text-xl font-bold text-maninho-700">
              {brl(totalServicos + totalPecas)}
            </span>
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={() => { limpar(); onFechar(); }}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando || !clientePronto || !carroPronto}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Abrir ordem'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Modal marcar como paga
// ---------------------------------------------------------------------
function PagarOS({ os, onFechar, onPago }) {
  const [forma, setForma] = useState('dinheiro');
  const [pagoEm, setPagoEm] = useState(hojeISO());
  const [valor, setValor] = useState('');
  const [notificarRecibo, setNotificarRecibo] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (os) {
      setValor(String(os.valor_total || ''));
      setForma('dinheiro'); setPagoEm(hojeISO()); setNotificarRecibo(false);
      setErro(''); setAviso('');
    }
  }, [os?.id]);

  if (!os) return null;

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setAviso(''); setSalvando(true);
    try {
      const atualizada = await api.mudarStatus(os.id, 'paga', notificarRecibo, {
        forma_pagamento: forma, pago_em: pagoEm, valor_pago: Number(valor),
      });
      if (notificarRecibo && atualizada.whatsapp && !atualizada.whatsapp.enviado) {
        setAviso(`Pagamento registrado. Recibo por WhatsApp não foi enviado: ${atualizada.whatsapp.motivo}`);
        // não fecha — dá tempo do usuário ler o aviso
        return;
      }
      onPago(atualizada);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={!!os} titulo={`Baixar pagamento — OS nº ${os.numero_os}`}
      largura="max-w-md" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        {aviso && <Alerta tipo="aviso" onFechar={() => { setAviso(''); onPago(os); }}>{aviso}</Alerta>}

        <div className="rounded-md bg-maninho-50 p-3 text-center">
          <p className="text-xs text-slate-500">Total da OS</p>
          <p className="numero text-2xl text-maninho-700">{brl(os.valor_total)}</p>
        </div>

        <Campo label="Forma de pagamento" obrigatorio>
          <select className="input" value={forma} onChange={(e) => setForma(e.target.value)}>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f.valor} value={f.valor}>{f.rotulo}</option>
            ))}
          </select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Data" obrigatorio>
            <input type="date" className="input" value={pagoEm} required
              onChange={(e) => setPagoEm(e.target.value)} />
          </Campo>
          <Campo label="Valor pago" obrigatorio>
            <input type="number" step="0.01" min="0" className="input tnum" value={valor} required
              onChange={(e) => setValor(e.target.value)} />
          </Campo>
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <input type="checkbox" checked={notificarRecibo}
            onChange={(e) => setNotificarRecibo(e.target.checked)}
            className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-600/30" />
          Enviar recibo por WhatsApp ao cliente
        </label>

        <p className="text-xs text-slate-500">
          Valor menor que o total é aceito (pagamento parcial). O saldo fica em aberto na OS.
        </p>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-ouro" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Confirmar pagamento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Modal detalhe da OS
// ---------------------------------------------------------------------
function DetalheOS({ os, onFechar, onMudou, onPagar }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [servicos, setServicos] = useState([]);
  const [novoSvc, setNovoSvc] = useState({ servico_id: '', quantidade: 1, valor_unit: '' });
  const [novaPeca, setNovaPeca] = useState({ descricao: '', quantidade: 1, valor_unit: '' });
  const [addAberto, setAddAberto] = useState(null); // 'servico' | 'peca' | null
  const [fotos, setFotos] = useState([]);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [previewFoto, setPreviewFoto] = useState(null);
  const inputFileRef = useRef(null);

  const editavel = os && os.status !== 'paga';

  useEffect(() => {
    if (!os || !editavel) return;
    api.servicos().then(setServicos).catch(() => {});
  }, [os?.id, editavel]);

  useEffect(() => {
    if (!os) return;
    api.anexosDaOS(os.id).then(setFotos).catch(() => setFotos([]));
  }, [os?.id]);

  async function enviarFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(''); setEnviandoFoto(true);
    try {
      await api.enviarAnexoOS(os.id, file);
      const atualizada = await api.anexosDaOS(os.id);
      setFotos(atualizada);
    } catch (err) {
      setErro(`Foto não enviada: ${err.message}`);
    } finally {
      setEnviandoFoto(false);
      if (inputFileRef.current) inputFileRef.current.value = '';
    }
  }

  async function removerFoto(anexoId) {
    if (!confirm('Remover esta foto?')) return;
    try {
      await api.removerAnexo(anexoId);
      setFotos((f) => f.filter((x) => x.id !== anexoId));
    } catch (err) { setErro(err.message); }
  }

  if (!os) return null;

  async function mudar(status) {
    if (status === 'paga') { onPagar(os); return; }
    setCarregando(true); setErro(''); setAviso('');
    try {
      const notificar = status === 'finalizada';
      const atualizada = await api.mudarStatus(os.id, status, notificar);
      if (atualizada.whatsapp && !atualizada.whatsapp.enviado) {
        setAviso(`Status atualizado, mas o WhatsApp não foi enviado: ${atualizada.whatsapp.motivo}`);
      }
      onMudou(atualizada);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  async function adicionarServico() {
    if (!novoSvc.servico_id) return;
    setCarregando(true); setErro('');
    try {
      const atualizada = await api.addServicoOS(os.id, {
        servico_id: novoSvc.servico_id,
        quantidade: Number(novoSvc.quantidade) || 1,
        valor_unit: novoSvc.valor_unit === '' ? undefined : Number(novoSvc.valor_unit),
      });
      setNovoSvc({ servico_id: '', quantidade: 1, valor_unit: '' });
      setAddAberto(null);
      onMudou(atualizada);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }

  async function adicionarPeca() {
    if (!novaPeca.descricao) return;
    setCarregando(true); setErro('');
    try {
      const atualizada = await api.addPecaOS(os.id, {
        descricao: novaPeca.descricao,
        quantidade: Number(novaPeca.quantidade) || 1,
        valor_unit: Number(novaPeca.valor_unit) || 0,
      });
      setNovaPeca({ descricao: '', quantidade: 1, valor_unit: '' });
      setAddAberto(null);
      onMudou(atualizada);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }

  async function removerItem(tipo, itemId) {
    if (!confirm('Remover este item?')) return;
    setCarregando(true); setErro('');
    try {
      const atualizada = tipo === 'servico'
        ? await api.removerServicoOS(os.id, itemId)
        : await api.removerPecaOS(os.id, itemId);
      onMudou(atualizada);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }

  function trocarServicoNovo(sid) {
    const s = servicos.find((x) => x.id === sid);
    setNovoSvc({ servico_id: sid, quantidade: 1,
      valor_unit: s ? String(s.valor_padrao) : '' });
  }

  return (
    <Modal aberto={!!os} largura="max-w-2xl" onFechar={onFechar}
      titulo={`Ordem nº ${os.numero_os}`}>
      <div className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
        {aviso && <Alerta tipo="aviso" onFechar={() => setAviso('')}>{aviso}</Alerta>}

        <div className="flex flex-wrap items-center gap-3">
          <Badge status={os.status} />
          <span className="text-xs text-slate-500">
            Aberta em {dataHora(os.aberta_em)}
            {os.criado_por_nome && <> · por <b className="text-slate-700">{os.criado_por_nome}</b></>}
          </span>
          <a href={`#/os/${os.id}/imprimir`} target="_blank" rel="noopener"
            className="ml-auto rounded bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
            title={os.status === 'paga' ? 'Imprimir recibo' : 'Imprimir OS para o cliente assinar'}>
            🖨 {os.status === 'paga' ? 'Recibo' : 'Imprimir'}
          </a>
          {os.paga_em && (
            <span className="text-xs text-emerald-700">
              · Paga em {data(os.paga_em)} · {rotuloForma(os.forma_pagamento)}
              {os.valor_pago && Number(os.valor_pago) !== Number(os.valor_total)
                ? ` (${brl(os.valor_pago)})` : ''}
            </span>
          )}
        </div>

        <div className="grid gap-4 rounded-md bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <p className="label">Cliente</p>
            <p className="text-sm font-semibold text-slate-800">{os.cliente_nome}</p>
            <p className="text-xs text-slate-500">{telefone(os.cliente_telefone)}</p>
          </div>
          <div>
            <p className="label">Veículo</p>
            <p className="text-sm font-semibold text-slate-800">
              {os.marca} {os.modelo} {os.ano ? `· ${os.ano}` : ''}
            </p>
            <p className="font-mono text-xs text-slate-500">
              {os.placa}{os.km_entrada ? ` · ${Number(os.km_entrada).toLocaleString('pt-BR')} km` : ''}
            </p>
          </div>
        </div>

        {os.observacoes && (
          <div className="rounded-md border-l-2 border-ouro-500 bg-ouro-100/40 px-3 py-2">
            <p className="label mb-0.5">Observações</p>
            <p className="text-sm text-slate-700">{os.observacoes}</p>
          </div>
        )}

        {/* Fotos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label">Fotos ({fotos.length})</p>
            <label className="btn-ghost cursor-pointer px-2.5 py-1 text-xs">
              {enviandoFoto ? '…enviando' : '+ Adicionar foto'}
              <input ref={inputFileRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={enviarFoto} disabled={enviandoFoto} />
            </label>
          </div>
          {fotos.length === 0 ? (
            <p className="py-3 text-center text-xs text-slate-400">
              Nenhuma foto anexada. Tira do painel, do hodômetro ou de um dano existente.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {fotos.map((f) => (
                <div key={f.id} className="group relative aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                  <AnexoImg id={f.id} alt={f.descricao || 'foto da OS'}
                    onClick={() => setPreviewFoto(f)}
                    className="h-full w-full cursor-pointer object-cover transition group-hover:opacity-80" />
                  <button onClick={() => removerFoto(f.id)}
                    className="absolute right-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 opacity-0 shadow transition group-hover:opacity-100"
                    title="Remover">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label">Serviços</p>
            {editavel && addAberto !== 'servico' && (
              <button onClick={() => setAddAberto('servico')} className="btn-ghost px-2.5 py-1 text-xs">
                + Adicionar
              </button>
            )}
          </div>
          {os.servicos?.length ? (
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {os.servicos.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 text-sm text-slate-700">{s.nome_servico}</td>
                    <td className="py-2 text-right text-xs text-slate-500">
                      {s.quantidade}× {brl(s.valor_unit)}
                    </td>
                    <td className="tnum w-24 py-2 text-right text-sm font-semibold">{brl(s.valor_total)}</td>
                    {editavel && (
                      <td className="w-8 py-2 text-right">
                        <button onClick={() => removerItem('servico', s.id)} disabled={carregando}
                          className="px-1.5 text-slate-400 hover:text-rose-600" title="Remover">✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-slate-400">Nenhum serviço lançado</p>}

          {editavel && addAberto === 'servico' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
              <select className="input flex-1 min-w-[180px] py-1.5 text-xs"
                value={novoSvc.servico_id} onChange={(e) => trocarServicoNovo(e.target.value)}>
                <option value="">Selecione…</option>
                {servicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <input type="number" min="1" className="input w-16 py-1.5 text-xs" value={novoSvc.quantidade}
                onChange={(e) => setNovoSvc((v) => ({ ...v, quantidade: e.target.value }))} />
              <input type="number" step="0.01" min="0" className="input w-28 py-1.5 text-xs tnum"
                value={novoSvc.valor_unit} placeholder="valor"
                onChange={(e) => setNovoSvc((v) => ({ ...v, valor_unit: e.target.value }))} />
              <button onClick={adicionarServico} disabled={!novoSvc.servico_id || carregando}
                className="btn-primary px-3 py-1 text-xs">Adicionar</button>
              <button onClick={() => setAddAberto(null)} className="btn-ghost px-2 py-1 text-xs">Cancelar</button>
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label">Peças</p>
            {editavel && addAberto !== 'peca' && (
              <button onClick={() => setAddAberto('peca')} className="btn-ghost px-2.5 py-1 text-xs">
                + Adicionar
              </button>
            )}
          </div>
          {os.pecas?.length ? (
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {os.pecas.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 text-sm text-slate-700">{p.descricao}</td>
                    <td className="py-2 text-right text-xs text-slate-500">
                      {Number(p.quantidade)}× {brl(p.valor_unit)}
                    </td>
                    <td className="tnum w-24 py-2 text-right text-sm font-semibold">{brl(p.valor_total)}</td>
                    {editavel && (
                      <td className="w-8 py-2 text-right">
                        <button onClick={() => removerItem('peca', p.id)} disabled={carregando}
                          className="px-1.5 text-slate-400 hover:text-rose-600" title="Remover">✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma peça lançada</p>
          )}

          {editavel && addAberto === 'peca' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
              <input className="input flex-1 min-w-[180px] py-1.5 text-xs" placeholder="Descrição da peça"
                value={novaPeca.descricao}
                onChange={(e) => setNovaPeca((v) => ({ ...v, descricao: e.target.value }))} />
              <input type="number" min="0.01" step="0.01" className="input w-16 py-1.5 text-xs" value={novaPeca.quantidade}
                onChange={(e) => setNovaPeca((v) => ({ ...v, quantidade: e.target.value }))} />
              <input type="number" step="0.01" min="0" className="input w-28 py-1.5 text-xs tnum" placeholder="valor"
                value={novaPeca.valor_unit}
                onChange={(e) => setNovaPeca((v) => ({ ...v, valor_unit: e.target.value }))} />
              <button onClick={adicionarPeca}
                disabled={!novaPeca.descricao || !novaPeca.valor_unit || carregando}
                className="btn-primary px-3 py-1 text-xs">Adicionar</button>
              <button onClick={() => setAddAberto(null)} className="btn-ghost px-2 py-1 text-xs">Cancelar</button>
            </div>
          )}
        </div>

        <div className="space-y-1 rounded-md bg-maninho-50 px-4 py-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Serviços</span><span className="tnum">{brl(os.valor_servicos)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Peças</span><span className="tnum">{brl(os.valor_pecas)}</span>
          </div>
          {Number(os.desconto) > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Desconto</span><span className="tnum">− {brl(os.desconto)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-maninho-200 pt-2">
            <span className="font-semibold text-maninho-800">Total</span>
            <span className="numero text-2xl text-maninho-700">{brl(os.valor_total)}</span>
          </div>
        </div>

        {PROXIMOS[os.status].length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <span className="self-center text-xs text-slate-500">Mudar para:</span>
            {PROXIMOS[os.status].map((s) => (
              <button key={s} onClick={() => mudar(s)} disabled={carregando}
                className={s === 'paga' ? 'btn-ouro' : 'btn-ghost'}>
                {carregando ? <Spinner className="h-4 w-4" /> : STATUS[s].texto}
              </button>
            ))}
          </div>
        )}
        {os.status === 'paga' && (
          <p className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            Ordem paga e encerrada. Não pode ser reaberta nem alterada.
          </p>
        )}
      </div>

      {/* Preview grande da foto */}
      <Modal aberto={!!previewFoto} titulo={previewFoto?.descricao || 'Foto da OS'}
        largura="max-w-3xl" onFechar={() => setPreviewFoto(null)}>
        {previewFoto && (
          <div className="flex justify-center">
            <AnexoImg id={previewFoto.id} alt="foto"
              className="max-h-[70vh] w-auto object-contain" />
          </div>
        )}
      </Modal>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------
export default function Ordens() {
  const hoje = new Date();
  const [ref, setRef] = useState({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, todos: false });
  const [lista, setLista] = useState(null);
  const [status, setStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [pagando, setPagando] = useState(null);

  const carregar = useCallback(() => {
    setErro('');
    const params = { status, busca, por_pagina: 100 };
    if (!ref.todos) { params.ano = ref.ano; params.mes = ref.mes; }
    api.ordens(params).then(setLista).catch((e) => setErro(e.message));
  }, [status, busca, ref.ano, ref.mes, ref.todos]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  function mudarMes(delta) {
    setRef((r) => {
      let m = r.mes + delta, a = r.ano;
      if (m > 12) { m = 1; a += 1; }
      if (m < 1)  { m = 12; a -= 1; }
      return { ano: a, mes: m, todos: false };
    });
  }
  const eMesAtual = !ref.todos && ref.ano === hoje.getFullYear() && ref.mes === hoje.getMonth() + 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Ordens de serviço {eMesAtual && '— mês atual'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {lista ? `${lista.paginacao.total} no período` : 'Carregando…'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setNovaAberta(true)}>+ Nova ordem</button>
      </div>

      {/* Seletor de mês */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white p-1 shadow-sm">
          <button onClick={() => mudarMes(-1)} disabled={ref.todos}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:text-slate-300">◀</button>
          <span className="tnum px-3 text-sm font-semibold text-slate-800">
            {ref.todos ? 'Todos os meses' : `${nomeMes(ref.mes)}/${ref.ano}`}
          </span>
          <button onClick={() => mudarMes(1)} disabled={ref.todos || eMesAtual}
            className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300">▶</button>
        </div>
        <button onClick={() => setRef({ ano: hoje.getFullYear(), mes: hoje.getMonth() + 1, todos: false })}
          className="btn-ghost px-3 py-1.5 text-xs" disabled={eMesAtual}>Mês atual</button>
        <button onClick={() => setRef((r) => ({ ...r, todos: !r.todos }))}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md
            ${ref.todos ? 'bg-maninho-600 text-white' : 'btn-ghost'}`}>
          {ref.todos ? '✓ Todos' : 'Ver todos os meses'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
          {FILTROS.map((f) => (
            <button key={f.chave} onClick={() => setStatus(f.chave)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition
                ${status === f.chave ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {f.texto}
            </button>
          ))}
        </div>
        <input className="input max-w-xs" placeholder="Buscar por cliente, placa ou nº"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="card overflow-hidden">
        {!lista ? (
          <div className="space-y-2 p-4">
            {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : lista.dados.length === 0 ? (
          <Vazio titulo="Nenhuma ordem encontrada"
            descricao={busca || status ? 'Tente mudar o filtro ou a busca.' : 'Nenhuma ordem neste mês.'}
            acao={<button className="btn-primary mt-3" onClick={() => setNovaAberta(true)}>+ Nova ordem</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/80">
                <tr>
                  <th className="th w-16">Nº</th>
                  <th className="th">Cliente</th>
                  <th className="th">Veículo</th>
                  <th className="th w-28">Aberta</th>
                  <th className="th w-32">Status</th>
                  <th className="th w-28 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.dados.map((o) => (
                  <tr key={o.id} onClick={() => setDetalhe(o)}
                    className="cursor-pointer transition hover:bg-maninho-50/60">
                    <td className="td tnum font-semibold text-maninho-600">{o.numero_os}</td>
                    <td className="td">
                      <p className="font-medium text-slate-800">{o.cliente_nome}</p>
                      <p className="text-xs text-slate-500">{telefone(o.cliente_telefone)}</p>
                    </td>
                    <td className="td">
                      <p className="font-mono text-xs font-semibold text-slate-700">{o.placa}</p>
                      <p className="text-xs text-slate-500">{o.marca} {o.modelo}</p>
                    </td>
                    <td className="td text-xs text-slate-500">
                      <p>{data(o.aberta_em)}</p>
                      {o.criado_por_nome && (
                        <p className="text-[10px] text-slate-400">por {o.criado_por_nome.split(' ')[0]}</p>
                      )}
                    </td>
                    <td className="td"><Badge status={o.status} /></td>
                    <td className="td tnum text-right font-semibold text-slate-800">{brl(o.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NovaOS aberto={novaAberta} onFechar={() => setNovaAberta(false)}
        onCriada={(os) => {
          setNovaAberta(false);
          carregar();
          if (os.whatsapp && !os.whatsapp.enviado) {
            setErro(`Ordem nº ${os.numero_os} criada. WhatsApp não enviado: ${os.whatsapp.motivo}`);
          }
        }} />

      <DetalheOS os={detalhe} onFechar={() => setDetalhe(null)}
        onMudou={(nova) => { setDetalhe(nova); carregar(); }}
        onPagar={(o) => { setDetalhe(null); setPagando(o); }} />

      <PagarOS os={pagando} onFechar={() => setPagando(null)}
        onPago={() => { setPagando(null); carregar(); }} />
    </div>
  );
}
