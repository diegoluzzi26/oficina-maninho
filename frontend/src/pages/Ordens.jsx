import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api, getToken } from '../lib/api';
import { brl, data, dataHora, telefone, STATUS, nomeMes,
  FORMAS_PAGAMENTO, rotuloForma, hojeISO } from '../lib/format';
import { Badge, Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';
import { SeletorMarcaModelo } from '../components/SeletorMarcaModelo';
import { HistoricoCarro } from '../components/HistoricoCarro';
import { ChecklistOS } from '../components/ChecklistOS';
import { MARCAS } from '../lib/marcas-carros';
import { FormCliente, FormCarro } from './Clientes';
import { podeExcluir } from '../lib/permissoes';

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

/**
 * Dropdown de status inline — usado na tabela pra o atendente
 * mudar status sem precisar abrir o detalhe.
 * Se escolher "paga", delega pro modal PagarOS (que pede forma/data/valor).
 */
function StatusInline({ os, onMudar, onPagar }) {
  const [aberto, setAberto] = useState(false);
  const proximos = PROXIMOS[os.status] || [];

  if (!proximos.length) return <Badge status={os.status} />;

  return (
    <div className="relative inline-block"
      onClick={(e) => e.stopPropagation()}>
      <button onClick={() => setAberto((v) => !v)}
        className="group inline-flex items-center gap-1"
        title="Mudar status">
        <Badge status={os.status} />
        <span className="text-[10px] text-slate-400 group-hover:text-slate-700">▾</span>
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 min-w-[140px] rounded-md border border-slate-200 bg-white p-1 shadow-lg">
            {proximos.map((s) => (
              <button key={s}
                onClick={() => {
                  setAberto(false);
                  if (s === 'paga') onPagar(os);
                  else onMudar(os, s);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-maninho-50">
                → {STATUS[s].texto}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Modal nova OS — cliente existente OU novo
// ---------------------------------------------------------------------
function NovaOS({ aberto, onFechar, onCriada }) {
  const [clientes, setClientes] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [pecasCatalogo, setPecasCatalogo] = useState([]);
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

  // Catálogos (serviços + peças): carrega uma vez quando o modal abre.
  useEffect(() => {
    if (!aberto) return;
    Promise.all([api.servicos(), api.pecas()])
      .then(([s, p]) => { setServicos(s); setPecasCatalogo(p); })
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
    setItens((v) => [...v, {
      servico_id: null, nome_servico: '', quantidade: 1, valor_unit: '',
    }]);
  }
  /** Quando o usuário digita/escolhe o nome do serviço.
   * Se bater case-insensitive com um do catálogo, herda o valor_padrão. */
  function atualizarNomeServico(idx, nome) {
    setItens((v) => v.map((it, i) => {
      if (i !== idx) return it;
      const hit = servicos.find((s) => s.nome.toLowerCase() === nome.trim().toLowerCase());
      return {
        ...it,
        servico_id: hit ? hit.id : null,
        nome_servico: nome,
        valor_unit: (it.valor_unit === '' || it.valor_unit === null) && hit
          ? Number(hit.valor_padrao)
          : it.valor_unit,
      };
    }));
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
        // Cada item envia servico_id se existir (do datalist) OU nome_servico
        // (livre — backend cria no catálogo automático).
        servicos: itens.map((i) => ({
          servico_id: i.servico_id || undefined,
          nome_servico: i.nome_servico,
          quantidade: Number(i.quantidade),
          valor_unit: Number(i.valor_unit),
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
              <SeletorMarcaModelo marca={novoCarro.marca} modelo={novoCarro.modelo} obrigatorio
                onChange={({ marca, modelo }) => setNovoCarro({ ...novoCarro, marca, modelo })} />
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
              <datalist id="datalist-servicos">
                {servicos.map((s) => (
                  <option key={s.id} value={s.nome}>{`R$ ${Number(s.valor_padrao).toFixed(2)}`}</option>
                ))}
              </datalist>
              {itens.map((it, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <input list="datalist-servicos"
                    className="input flex-1 min-w-[180px] py-1.5 text-xs"
                    placeholder="Ex: Troca de bateria (do catálogo ou novo)"
                    value={it.nome_servico}
                    onChange={(e) => atualizarNomeServico(idx, e.target.value)} />
                  <input type="number" min="1" className="input w-16 py-1.5 text-xs" value={it.quantidade}
                    onChange={(e) => setItens((v) => v.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)))} />
                  <input type="number" step="0.01" min="0" className="input w-28 py-1.5 text-xs tnum"
                    placeholder="valor"
                    value={it.valor_unit}
                    onChange={(e) => setItens((v) => v.map((x, i) => (i === idx ? { ...x, valor_unit: e.target.value } : x)))} />
                  <button type="button" onClick={() => setItens((v) => v.filter((_, i) => i !== idx))}
                    className="px-1.5 text-slate-400 transition hover:text-rose-600" title="Remover">✕</button>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">
                Ao lançar um serviço novo (fora do catálogo), ele é cadastrado automaticamente.
              </p>
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
              <datalist id="datalist-pecas">
                {pecasCatalogo.map((p) => (
                  <option key={p.id} value={p.nome}>{`R$ ${Number(p.valor_padrao).toFixed(2)}`}</option>
                ))}
              </datalist>
              {pecas.map((p, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <input list="datalist-pecas"
                    className="input flex-1 min-w-[180px] py-1.5 text-xs"
                    placeholder="Descrição da peça (do catálogo ou nova)"
                    value={p.descricao}
                    onChange={(e) => {
                      const nome = e.target.value;
                      const hit = pecasCatalogo.find(
                        (x) => x.nome.toLowerCase() === nome.trim().toLowerCase());
                      setPecas((v) => v.map((x, i) => (i === idx
                        ? { ...x, descricao: nome,
                            valor_unit: (x.valor_unit === '' || x.valor_unit == null) && hit
                              ? Number(hit.valor_padrao) : x.valor_unit }
                        : x)));
                    }} />
                  <input type="number" min="0.01" step="0.01" className="input w-16 py-1.5 text-xs" value={p.quantidade}
                    onChange={(e) => setPecas((v) => v.map((x, i) => (i === idx ? { ...x, quantidade: e.target.value } : x)))} />
                  <input type="number" step="0.01" min="0" className="input w-28 py-1.5 text-xs tnum" placeholder="0,00"
                    value={p.valor_unit}
                    onChange={(e) => setPecas((v) => v.map((x, i) => (i === idx ? { ...x, valor_unit: e.target.value } : x)))} />
                  <button type="button" onClick={() => setPecas((v) => v.filter((_, i) => i !== idx))}
                    className="px-1.5 text-slate-400 transition hover:text-rose-600" title="Remover">✕</button>
                </div>
              ))}
              <p className="text-[11px] text-slate-500">
                Ao lançar uma peça nova (fora do catálogo), ela é cadastrada automaticamente.
              </p>
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
// Modal marcar como paga — aceita até 2 formas de pagamento (split).
// Se só uma parcela, o form fica igual ao de antes. O botão "+ segunda
// forma" habilita a segunda linha; ao chegar em 2, o campo Valor da
// primeira parcela vira o único editável e a segunda é sempre o resto.
// ---------------------------------------------------------------------
function PagarOS({ os, onFechar, onPago }) {
  // Sempre um array. Segunda linha adicionada sob demanda.
  const [parcelas, setParcelas] = useState([
    { forma: 'dinheiro', valor: '' },
  ]);
  const [pagoEm, setPagoEm] = useState(hojeISO());
  const [notificarRecibo, setNotificarRecibo] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Adiantamentos já registrados enquanto a OS estava em andamento:
  // desconta do total pra sugerir só o saldo restante.
  const jaRecebido = (os?.pagamentos || [])
    .reduce((s, p) => s + Number(p.valor || 0), 0);
  const restante = os ? Math.max(0, Number((Number(os.valor_total) - jaRecebido).toFixed(2))) : 0;

  useEffect(() => {
    if (os) {
      setParcelas([{ forma: 'dinheiro', valor: String(restante || os.valor_total || '') }]);
      setPagoEm(hojeISO()); setNotificarRecibo(false);
      setErro(''); setAviso('');
    }
  }, [os?.id]);

  if (!os) return null;

  const totalParcelas = parcelas.reduce(
    (s, p) => s + (Number(p.valor) || 0), 0,
  );
  const totalOS = Number(os.valor_total) || 0;
  // O "esperado" é o restante quando há adiantamento, ou o total se não teve.
  const esperado = restante > 0 ? restante : totalOS;
  const diferenca = Number((totalParcelas - esperado).toFixed(2));

  function alterarParcela(idx, campo, v) {
    setParcelas((atuais) => atuais.map((p, i) => (i === idx ? { ...p, [campo]: v } : p)));
  }

  function adicionarSegunda() {
    // Sugere já dividido: primeira = metade, segunda = resto.
    const metade = (totalOS / 2).toFixed(2);
    setParcelas([
      { forma: parcelas[0].forma, valor: metade },
      { forma: parcelas[0].forma === 'pix' ? 'dinheiro' : 'pix', valor: (totalOS - Number(metade)).toFixed(2) },
    ]);
  }

  function removerSegunda() {
    setParcelas([{ forma: parcelas[0].forma, valor: String(totalOS) }]);
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setAviso('');

    const parcelasValidas = parcelas.filter((p) => Number(p.valor) > 0);
    if (!parcelasValidas.length) {
      setErro('Informe pelo menos um pagamento com valor.'); return;
    }
    if (parcelasValidas.length > 1) {
      const formasIguais = parcelasValidas[0].forma === parcelasValidas[1].forma;
      if (formasIguais) {
        setErro('Ao dividir o pagamento, escolha duas formas diferentes.'); return;
      }
    }

    setSalvando(true);
    try {
      const payload = parcelasValidas.length === 1
        ? {
            forma_pagamento: parcelasValidas[0].forma,
            pago_em: pagoEm,
            valor_pago: Number(parcelasValidas[0].valor),
          }
        : {
            pago_em: pagoEm,
            pagamentos: parcelasValidas.map((p) => ({
              forma: p.forma, valor: Number(p.valor), pago_em: pagoEm,
            })),
          };
      const atualizada = await api.mudarStatus(os.id, 'paga', notificarRecibo, payload);
      if (notificarRecibo && atualizada.whatsapp && !atualizada.whatsapp.enviado) {
        setAviso(`Pagamento registrado. Recibo por WhatsApp não foi enviado: ${atualizada.whatsapp.motivo}`);
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
          {jaRecebido > 0 && (
            <div className="mt-2 flex items-center justify-center gap-3 text-xs">
              <span className="text-emerald-700">
                Já recebido: <strong className="tnum">{brl(jaRecebido)}</strong>
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-maninho-700">
                Falta: <strong className="tnum">{brl(restante)}</strong>
              </span>
            </div>
          )}
        </div>

        <Campo label="Data do pagamento" obrigatorio>
          <input type="date" className="input" value={pagoEm} required
            onChange={(e) => setPagoEm(e.target.value)} />
        </Campo>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Formas de pagamento
            </p>
            {parcelas.length === 1 ? (
              <button type="button" onClick={adicionarSegunda}
                className="text-xs font-semibold text-maninho-700 hover:underline">
                + dividir em 2
              </button>
            ) : (
              <button type="button" onClick={removerSegunda}
                className="text-xs font-semibold text-rose-600 hover:underline">
                usar só 1 forma
              </button>
            )}
          </div>

          {parcelas.map((p, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_140px] gap-2">
              <select className="input" value={p.forma}
                onChange={(e) => alterarParcela(idx, 'forma', e.target.value)}>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.rotulo}</option>
                ))}
              </select>
              <input type="number" step="0.01" min="0" className="input tnum text-right"
                placeholder="0,00" value={p.valor} required
                onChange={(e) => alterarParcela(idx, 'valor', e.target.value)} />
            </div>
          ))}

          <div className={`flex items-center justify-between rounded px-3 py-2 text-xs
            ${Math.abs(diferenca) < 0.01 ? 'bg-emerald-50 text-emerald-800'
              : diferenca < 0 ? 'bg-amber-50 text-amber-800'
              : 'bg-rose-50 text-rose-800'}`}>
            <span>Somado: <strong className="tnum">{brl(totalParcelas)}</strong></span>
            {Math.abs(diferenca) < 0.01
              ? <span>= {jaRecebido > 0 ? 'valor restante' : 'total da OS'}</span>
              : diferenca < 0
                ? <span>faltam <strong className="tnum">{brl(Math.abs(diferenca))}</strong> (pagamento parcial)</span>
                : <span>excede em <strong className="tnum">{brl(diferenca)}</strong></span>}
          </div>
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
// Adiantamentos: pagamentos parciais que o cliente vai fazendo antes
// da OS fechar. Aparece só quando a OS não está paga. Ao dar baixa,
// o modal PagarOS desconta o já recebido do valor sugerido.
// ---------------------------------------------------------------------
function Adiantamentos({ os, onMudou }) {
  const [aberto, setAberto] = useState(false);
  const [forma, setForma] = useState('dinheiro');
  const [valor, setValor] = useState('');
  const [pagoEm, setPagoEm] = useState(hojeISO());
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const pagamentos = os.pagamentos || [];
  const jaRecebido = pagamentos.reduce((s, p) => s + Number(p.valor || 0), 0);
  const restante = Math.max(0, Number((Number(os.valor_total) - jaRecebido).toFixed(2)));

  async function salvar(e) {
    e.preventDefault();
    if (!(Number(valor) > 0)) { setErro('Informe um valor maior que zero'); return; }
    setSalvando(true); setErro('');
    try {
      const atualizada = await api.adicionarPagamentoOS(os.id, {
        forma, valor: Number(valor), pago_em: pagoEm,
      });
      setForma('dinheiro'); setValor(''); setPagoEm(hojeISO());
      setAberto(false);
      onMudou(atualizada);
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  async function remover(pagId) {
    if (!confirm('Remover este adiantamento?')) return;
    try {
      const atualizada = await api.removerPagamentoOS(os.id, pagId);
      onMudou(atualizada);
    } catch (err) { setErro(err.message); }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="label mb-0">Adiantamentos</p>
          <p className="text-[11px] text-slate-500">
            Valor que o cliente já pagou antes de fechar a OS
          </p>
        </div>
        {!aberto && (
          <button type="button"
            onClick={() => {
              // Pré-preenche com o restante quando dá; senão deixa vazio pro
              // usuário digitar o valor entregue pelo cliente (caso da OS
              // ainda sem itens ou já com adiantamentos acima do total).
              setValor(restante > 0 ? String(restante) : '');
              setAberto(true);
            }}
            className="rounded bg-maninho-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-maninho-700">
            + Adicionar
          </button>
        )}
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {pagamentos.length === 0 && !aberto && (
        <p className="py-2 text-center text-xs text-slate-400">
          Nenhum adiantamento registrado.
        </p>
      )}

      {pagamentos.length > 0 && (
        <ul className="mb-2 divide-y divide-slate-100 text-sm">
          {pagamentos.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-1.5">
              <span className="flex-1">
                <span className="font-semibold text-slate-700">{rotuloForma(p.forma)}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {data(p.pago_em)}
                </span>
              </span>
              <span className="tnum font-semibold text-emerald-700">{brl(p.valor)}</span>
              <button type="button" onClick={() => remover(p.id)}
                className="ml-3 text-xs text-slate-400 hover:text-rose-600"
                title="Remover">✕</button>
            </li>
          ))}
          <li className="flex items-center justify-between py-1.5 text-xs">
            <span className="text-emerald-700">Já recebido</span>
            <span className="tnum font-bold text-emerald-700">{brl(jaRecebido)}</span>
            <span className="ml-3 w-4" />
          </li>
          <li className="flex items-center justify-between py-1.5 text-xs">
            <span className="text-maninho-700">Falta</span>
            <span className="tnum font-bold text-maninho-700">{brl(restante)}</span>
            <span className="ml-3 w-4" />
          </li>
        </ul>
      )}

      {aberto && (
        <form onSubmit={salvar} className="grid grid-cols-[1fr_1fr_130px_auto] gap-2 border-t border-slate-100 pt-2">
          <select className="input py-1.5 text-xs" value={forma}
            onChange={(e) => setForma(e.target.value)}>
            {FORMAS_PAGAMENTO.map((f) => (
              <option key={f.valor} value={f.valor}>{f.rotulo}</option>
            ))}
          </select>
          <input type="date" className="input py-1.5 text-xs" value={pagoEm}
            onChange={(e) => setPagoEm(e.target.value)} required />
          <input type="number" step="0.01" min="0.01" className="input tnum py-1.5 text-xs text-right"
            placeholder="0,00" value={valor}
            onChange={(e) => setValor(e.target.value)} required />
          <div className="flex gap-1">
            <button type="submit" disabled={salvando}
              className="btn-primary px-2 py-1 text-xs">
              {salvando ? '…' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setAberto(false)}
              className="btn-ghost px-2 py-1 text-xs">Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Kanban: colunas por status, cards com foto do carro
// ---------------------------------------------------------------------
const COLUNAS_KANBAN = [
  { chave: 'aberta',       titulo: 'Aberta',       cor: 'border-slate-300' },
  { chave: 'em_andamento', titulo: 'Em andamento', cor: 'border-ouro-400' },
  { chave: 'finalizada',   titulo: 'Finalizada',   cor: 'border-marca-400' },
  { chave: 'paga',         titulo: 'Paga',         cor: 'border-emerald-400' },
];

function CardKanban({ o, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full overflow-hidden rounded-md border border-slate-200 bg-white text-left shadow-sm transition hover:border-maninho-400 hover:shadow-md">
      {o.foto_id ? (
        <AnexoImg id={o.foto_id} alt={`Foto OS ${o.numero_os}`}
          className="h-28 w-full object-cover" />
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-slate-100 text-3xl text-slate-300">
          🚗
        </div>
      )}
      <div className="p-2.5">
        <div className="flex items-center justify-between">
          <span className="tnum text-[11px] font-bold text-maninho-600">#{o.numero_os}</span>
          <span className="tnum text-xs font-semibold text-slate-700">{brl(o.valor_total)}</span>
        </div>
        <p className="mt-1 truncate text-xs font-semibold text-slate-800">{o.cliente_nome}</p>
        <p className="truncate font-mono text-[11px] text-slate-500">{o.placa}</p>
        <p className="truncate text-[10px] text-slate-400">{o.marca} {o.modelo}</p>
      </div>
    </button>
  );
}

function KanbanOS({ ordens, onCard }) {
  const porStatus = COLUNAS_KANBAN.map((col) => ({
    ...col,
    ordens: ordens.filter((o) => o.status === col.chave),
  }));
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {porStatus.map((col) => (
        <div key={col.chave} className={`rounded-md border-t-4 bg-slate-50/60 p-2 ${col.cor}`}>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              {col.titulo}
            </p>
            <span className="tnum rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">
              {col.ordens.length}
            </span>
          </div>
          {col.ordens.length === 0 ? (
            <p className="rounded border border-dashed border-slate-300 py-6 text-center text-[10px] text-slate-400">
              vazio
            </p>
          ) : (
            <div className="space-y-2">
              {col.ordens.map((o) => (
                <CardKanban key={o.id} o={o} onClick={() => onCard(o)} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Modal detalhe da OS
// ---------------------------------------------------------------------
function DetalheOS({ os, onFechar, onMudou, onPagar, onExcluida }) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [servicos, setServicos] = useState([]);
  const [novoSvc, setNovoSvc] = useState({ servico_id: '', nome_servico: '', quantidade: 1, valor_unit: '' });
  const [novaPeca, setNovaPeca] = useState({ descricao: '', quantidade: 1, valor_unit: '' });
  const [addAberto, setAddAberto] = useState(null); // 'servico' | 'peca' | null
  const [fotos, setFotos] = useState([]);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [previewFoto, setPreviewFoto] = useState(null);
  const inputFileRef = useRef(null);

  // OS pagas continuam editáveis pra corrigir mistake de digitação —
  // se o dono cobrou/lançou errado, poder ajustar depois é mais útil
  // do que travar "por ser fiscal". O botão de excluir OS paga
  // continua bloqueado (registro histórico não some).
  const editavel = !!os;
  const foiPaga = os && os.status === 'paga';

  const [pecasCatalogo, setPecasCatalogo] = useState([]);
  const [editPag, setEditPag] = useState(false);
  const [pagEdit, setPagEdit] = useState(null);
  // Edição inline do cliente e do carro vinculados à OS.
  // Carrega sob demanda pra ter todos os campos (o SELECT_OS só expõe alguns).
  const [clienteEditando, setClienteEditando] = useState(null);
  const [carroEditando, setCarroEditando] = useState(null);

  async function abrirEditarCliente() {
    setErro('');
    try { setClienteEditando(await api.cliente(os.cliente_id)); }
    catch (e) { setErro(e.message); }
  }
  async function abrirEditarCarro() {
    setErro('');
    try { setCarroEditando(await api.carro(os.carro_id)); }
    catch (e) { setErro(e.message); }
  }

  useEffect(() => {
    if (!os || !editavel) return;
    Promise.all([api.servicos(), api.pecas()])
      .then(([s, p]) => { setServicos(s); setPecasCatalogo(p); })
      .catch(() => {});
  }, [os?.id, editavel]);

  useEffect(() => {
    if (!editPag || !os) return;
    setPagEdit({
      valor_pago: os.valor_pago != null ? String(os.valor_pago) : String(os.valor_total || ''),
      pago_em: os.paga_em ? String(os.paga_em).slice(0, 10) : hojeISO(),
      forma_pagamento: os.forma_pagamento || 'dinheiro',
    });
  }, [editPag, os?.id]);

  async function salvarPagamento() {
    setCarregando(true); setErro('');
    try {
      const atualizada = await api.atualizarOS(os.id, {
        valor_pago: pagEdit.valor_pago === '' ? null : Number(pagEdit.valor_pago),
        pago_em: pagEdit.pago_em || null,
        forma_pagamento: pagEdit.forma_pagamento || null,
      });
      setEditPag(false);
      onMudou(atualizada);
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }

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
    if (!novoSvc.servico_id && !novoSvc.nome_servico) return;
    setCarregando(true); setErro('');
    try {
      const atualizada = await api.addServicoOS(os.id, {
        servico_id: novoSvc.servico_id || undefined,
        nome_servico: novoSvc.nome_servico,
        quantidade: Number(novoSvc.quantidade) || 1,
        valor_unit: novoSvc.valor_unit === '' ? undefined : Number(novoSvc.valor_unit),
      });
      setNovoSvc({ servico_id: '', nome_servico: '', quantidade: 1, valor_unit: '' });
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

  function atualizarNomeNovoSvc(nome) {
    const hit = servicos.find((x) => x.nome.toLowerCase() === nome.trim().toLowerCase());
    setNovoSvc((v) => ({
      ...v,
      servico_id: hit ? hit.id : '',
      nome_servico: nome,
      valor_unit: (v.valor_unit === '' || v.valor_unit == null) && hit
        ? String(hit.valor_padrao) : v.valor_unit,
    }));
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
              · Paga em {data(os.paga_em)} ·{' '}
              {os.pagamentos && os.pagamentos.length > 1
                ? os.pagamentos.map((p) =>
                    `${rotuloForma(p.forma)} ${brl(p.valor)}`).join(' + ')
                : rotuloForma(os.forma_pagamento)}
              {os.pagamentos && os.pagamentos.length <= 1
                && os.valor_pago && Number(os.valor_pago) !== Number(os.valor_total)
                ? ` (${brl(os.valor_pago)})` : ''}
              <button type="button" onClick={() => setEditPag((v) => !v)}
                className="ml-2 text-[11px] font-semibold text-maninho-600 hover:underline">
                {editPag ? 'cancelar edição' : 'editar pagamento'}
              </button>
            </span>
          )}
        </div>

        <div className="grid gap-4 rounded-md bg-slate-50 p-4 sm:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <p className="label">Cliente</p>
              <button type="button" onClick={abrirEditarCliente}
                className="text-[11px] font-semibold text-maninho-600 hover:underline"
                title="Corrigir dados do cliente">
                ✎ Editar
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-800">{os.cliente_nome}</p>
            <p className="text-xs text-slate-500">{telefone(os.cliente_telefone)}</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="label">Veículo</p>
              <button type="button" onClick={abrirEditarCarro}
                className="text-[11px] font-semibold text-maninho-600 hover:underline"
                title="Corrigir dados do veículo">
                ✎ Editar
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-800">
              {os.marca} {os.modelo} {os.ano ? `· ${os.ano}` : ''}
            </p>
            <p className="font-mono text-xs text-slate-500">
              {os.placa}{os.km_entrada ? ` · ${Number(os.km_entrada).toLocaleString('pt-BR')} km` : ''}
            </p>
            {os.cambio && (
              <span className="mt-1 inline-flex rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                Câmbio {os.cambio}
              </span>
            )}
          </div>
        </div>

        {os.observacoes && (
          <div className="rounded-md border-l-2 border-ouro-500 bg-ouro-100/40 px-3 py-2">
            <p className="label mb-0.5">Observações</p>
            <p className="text-sm text-slate-700">{os.observacoes}</p>
          </div>
        )}

        {/* Checklist de inspeção visual */}
        <details className="group rounded-md border border-slate-200 bg-slate-50/50">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-md">
            <span>Checklist de inspeção visual</span>
            <span className="text-xs text-slate-500 group-open:hidden">
              (27 itens em 4 seções)
            </span>
            <span className="ml-auto text-xs text-slate-400 group-open:rotate-180 transition">▼</span>
          </summary>
          <div className="border-t border-slate-200 p-3">
            <ChecklistOS os={os} />
          </div>
        </details>

        {/* Histórico do veículo (o que já foi feito antes) */}
        <details className="group rounded-md border border-slate-200 bg-slate-50/50">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-md">
            <span>Histórico deste veículo</span>
            <span className="text-xs text-slate-500 group-open:hidden">
              (o que já foi feito neste carro antes)
            </span>
            <span className="ml-auto text-xs text-slate-400 group-open:rotate-180 transition">▼</span>
          </summary>
          <div className="border-t border-slate-200 p-3">
            <HistoricoCarro carroId={os.carro_id} excluirOsId={os.id} compacto />
          </div>
        </details>

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
                  {podeExcluir() && (
                    <button onClick={() => removerFoto(f.id)}
                      className="absolute right-1 top-1 rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 opacity-0 shadow transition group-hover:opacity-100"
                      title="Remover">✕</button>
                  )}
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
              <datalist id="datalist-servicos-detalhe">
                {servicos.map((s) => (
                  <option key={s.id} value={s.nome}>{`R$ ${Number(s.valor_padrao).toFixed(2)}`}</option>
                ))}
              </datalist>
              <input list="datalist-servicos-detalhe"
                className="input flex-1 min-w-[180px] py-1.5 text-xs"
                placeholder="Nome do serviço (catálogo ou novo)"
                value={novoSvc.nome_servico}
                onChange={(e) => atualizarNomeNovoSvc(e.target.value)} />
              <input type="number" min="1" className="input w-16 py-1.5 text-xs" value={novoSvc.quantidade}
                onChange={(e) => setNovoSvc((v) => ({ ...v, quantidade: e.target.value }))} />
              <input type="number" step="0.01" min="0" className="input w-28 py-1.5 text-xs tnum"
                value={novoSvc.valor_unit} placeholder="valor"
                onChange={(e) => setNovoSvc((v) => ({ ...v, valor_unit: e.target.value }))} />
              <button onClick={adicionarServico}
                disabled={(!novoSvc.servico_id && !novoSvc.nome_servico) || carregando}
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
              <datalist id="datalist-pecas-detalhe">
                {pecasCatalogo.map((p) => (
                  <option key={p.id} value={p.nome}>{`R$ ${Number(p.valor_padrao).toFixed(2)}`}</option>
                ))}
              </datalist>
              <input list="datalist-pecas-detalhe"
                className="input flex-1 min-w-[180px] py-1.5 text-xs"
                placeholder="Peça (catálogo ou nova)"
                value={novaPeca.descricao}
                onChange={(e) => {
                  const nome = e.target.value;
                  const hit = pecasCatalogo.find(
                    (x) => x.nome.toLowerCase() === nome.trim().toLowerCase());
                  setNovaPeca((v) => ({
                    ...v, descricao: nome,
                    valor_unit: (v.valor_unit === '' || v.valor_unit == null) && hit
                      ? String(hit.valor_padrao) : v.valor_unit,
                  }));
                }} />
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

        {!foiPaga && (
          <Adiantamentos os={os} onMudou={onMudou} />
        )}

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

        {(PROXIMOS[os.status].length > 0 || os.status !== 'paga') && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
            {PROXIMOS[os.status].length > 0 && (
              <>
                <span className="self-center text-xs text-slate-500">Mudar para:</span>
                {PROXIMOS[os.status].map((s) => (
                  <button key={s} onClick={() => mudar(s)} disabled={carregando}
                    className={s === 'paga' ? 'btn-ouro' : 'btn-ghost'}>
                    {carregando ? <Spinner className="h-4 w-4" /> : STATUS[s].texto}
                  </button>
                ))}
              </>
            )}
            {podeExcluir() && (
              <button onClick={async () => {
                const aviso = os.status === 'paga'
                  ? `Excluir a OS nº ${os.numero_os}? Ela já foi PAGA — o registro do pagamento vai sumir junto com serviços, peças e fotos.`
                  : `Excluir a OS nº ${os.numero_os}? Serviços, peças e fotos vão junto.`;
                if (!confirm(aviso)) return;
                setCarregando(true); setErro('');
                try {
                  await api.excluirOS(os.id);
                  onExcluida?.(os);
                } catch (e) { setErro(e.message); }
                finally { setCarregando(false); }
              }}
              disabled={carregando}
              className="ml-auto rounded bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                🗑 Excluir OS
              </button>
            )}
          </div>
        )}
        {foiPaga && !editPag && (
          <p className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
            Ordem paga. Itens e valor do pagamento ainda podem ser corrigidos —
            use "editar pagamento" acima ou adicione/remova itens direto.
          </p>
        )}

        {foiPaga && editPag && pagEdit && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Corrigir pagamento
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Forma">
                <select className="input" value={pagEdit.forma_pagamento}
                  onChange={(e) => setPagEdit((p) => ({ ...p, forma_pagamento: e.target.value }))}>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f.valor} value={f.valor}>{f.rotulo}</option>
                  ))}
                </select>
              </Campo>
              <Campo label="Data">
                <input type="date" className="input" value={pagEdit.pago_em}
                  onChange={(e) => setPagEdit((p) => ({ ...p, pago_em: e.target.value }))} />
              </Campo>
              <Campo label="Valor pago (R$)">
                <input type="number" step="0.01" min="0" className="input tnum"
                  value={pagEdit.valor_pago}
                  onChange={(e) => setPagEdit((p) => ({ ...p, valor_pago: e.target.value }))} />
              </Campo>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEditPag(false)}>
                Cancelar
              </button>
              <button type="button" className="btn-ouro" onClick={salvarPagamento}
                disabled={carregando}>
                {carregando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Salvar correção'}
              </button>
            </div>
          </div>
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

      {/* Edição inline de cliente e carro vinculados à OS */}
      <FormCliente aberto={!!clienteEditando} cliente={clienteEditando}
        onFechar={() => setClienteEditando(null)}
        onSalvo={async () => {
          setClienteEditando(null);
          try { onMudou(await api.ordem(os.id)); } catch (e) { setErro(e.message); }
        }} />

      <FormCarro aberto={!!carroEditando} carro={carroEditando}
        onFechar={() => setCarroEditando(null)}
        onSalvo={async () => {
          setCarroEditando(null);
          try { onMudou(await api.ordem(os.id)); } catch (e) { setErro(e.message); }
        }} />
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Painel inline mostrado quando o atendente clica numa OS na lista.
// Mostra peças e serviços da OS e atalhos pra abrir o detalhe completo
// ou criar um retorno manual pré-preenchido com essa OS.
// ---------------------------------------------------------------------
function PreviewOS({ os, carregando, onAbrirModal, onNovoRetorno }) {
  if (carregando || !os) {
    return <div className="p-2"><Skeleton className="h-16" /></div>;
  }
  const totalServicos = (os.servicos || []).reduce(
    (s, i) => s + (Number(i.valor_unit) || 0) * (Number(i.quantidade) || 0), 0);
  const totalPecas = (os.pecas || []).reduce(
    (s, i) => s + (Number(i.valor_unit) || 0) * (Number(i.quantidade) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center justify-between">
            <p className="label">Serviços</p>
            <p className="tnum text-xs font-semibold text-slate-600">{brl(totalServicos)}</p>
          </div>
          {os.servicos?.length ? (
            <ul className="mt-1 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
              {os.servicos.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="flex-1 truncate text-slate-800">{s.nome_servico}</span>
                  <span className="text-[11px] text-slate-500">{s.quantidade}×</span>
                  <span className="tnum w-20 text-right font-semibold">{brl(Number(s.valor_unit) * Number(s.quantidade))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-xs italic text-slate-400">
              nenhum serviço lançado
            </p>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="label">Peças</p>
            <p className="tnum text-xs font-semibold text-slate-600">{brl(totalPecas)}</p>
          </div>
          {os.pecas?.length ? (
            <ul className="mt-1 divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
              {os.pecas.map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="flex-1 truncate text-slate-800">{p.descricao}</span>
                  <span className="text-[11px] text-slate-500">{p.quantidade}×</span>
                  <span className="tnum w-20 text-right font-semibold">{brl(Number(p.valor_unit) * Number(p.quantidade))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 rounded-md border border-dashed border-slate-200 bg-white px-3 py-2 text-xs italic text-slate-400">
              nenhuma peça lançada
            </p>
          )}
        </div>
      </div>

      {os.observacoes && (
        <div className="rounded-md bg-white/70 px-3 py-2 text-sm text-slate-700">
          <p className="label mb-0.5">Observações</p>
          {os.observacoes}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button onClick={onNovoRetorno}
          className="rounded bg-maninho-50 px-3 py-1 text-xs font-semibold text-maninho-700 hover:bg-maninho-100">
          + Retorno manual
        </button>
        <button onClick={onAbrirModal}
          className="rounded bg-maninho-600 px-3 py-1 text-xs font-semibold text-white hover:bg-maninho-700">
          Abrir / editar OS
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Modal — cria retorno manual pré-preenchido a partir de uma OS.
// ---------------------------------------------------------------------
function NovoRetornoDaOS({ os, onFechar, onCriado }) {
  const daquiSeisMeses = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  };
  const [agendado, setAgendado] = useState(daquiSeisMeses);
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!os) return;
    setAgendado(daquiSeisMeses());
    setMotivo(os.servicos?.[0]?.nome_servico || '');
    setObs('');
    setErro('');
  }, [os?.id]);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      await api.criarRetorno({
        cliente_id: os.cliente_id,
        carro_id: os.carro_id || null,
        os_id: os.id,
        agendado_para: agendado,
        motivo: motivo || null,
        nome_servico: motivo || null,
        observacao: obs || null,
      });
      onCriado();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={!!os} onFechar={onFechar}
      titulo={os ? `Novo retorno — OS nº ${os.numero_os}` : ''} largura="max-w-md">
      {os && (
        <form onSubmit={salvar} className="space-y-3">
          {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
          <p className="text-xs text-slate-500">
            Cliente: <span className="font-semibold text-slate-700">{os.cliente_nome}</span>
            {os.placa && <> · Veículo: <span className="font-mono font-semibold">{os.placa}</span></>}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Agendado para" obrigatorio>
              <input type="date" className="input" value={agendado}
                onChange={(e) => setAgendado(e.target.value)} required />
            </Campo>
            <Campo label="Motivo / serviço">
              <input className="input" value={motivo}
                placeholder="Ex.: troca de óleo"
                onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
          </div>
          <Campo label="Observação">
            <textarea className="input" rows={3} value={obs}
              placeholder="Anotação livre pro atendente"
              onChange={(e) => setObs(e.target.value)} />
          </Campo>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onFechar}
              className="btn-ghost px-3 py-1.5 text-sm">Cancelar</button>
            <button type="submit" className="btn-primary px-4 py-1.5 text-sm"
              disabled={salvando || !agendado}>
              {salvando ? <Spinner className="h-4 w-4" /> : 'Criar retorno'}
            </button>
          </div>
        </form>
      )}
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
  const [marca, setMarca] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [formaPag, setFormaPag] = useState('');
  const [clientes, setClientes] = useState([]);
  const [erro, setErro] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const [detalhe, setDetalhe] = useState(null);
  const [pagando, setPagando] = useState(null);
  const [expandidaId, setExpandidaId] = useState(null);
  const [expandida, setExpandida] = useState(null); // OS completa (com peças/serviços)
  const [carregandoExpansao, setCarregandoExpansao] = useState(false);
  const [novoRetorno, setNovoRetorno] = useState(null); // OS-alvo para criar retorno manual
  // Preferência de visualização persistida localmente
  const [vista, setVista] = useState(() => localStorage.getItem('ordens_vista') || 'lista');
  useEffect(() => { localStorage.setItem('ordens_vista', vista); }, [vista]);

  // Carrega clientes uma vez pra alimentar o filtro
  useEffect(() => {
    api.clientes({ por_pagina: 200 }).then((c) => setClientes(c.dados)).catch(() => {});
  }, []);

  const carregar = useCallback(() => {
    setErro('');
    const params = { status, busca, por_pagina: 100 };
    if (marca)     params.marca = marca;
    if (clienteId) params.cliente_id = clienteId;
    if (formaPag)  params.forma_pagamento = formaPag;
    if (!ref.todos) { params.ano = ref.ano; params.mes = ref.mes; }
    api.ordens(params).then(setLista).catch((e) => setErro(e.message));
  }, [status, busca, marca, clienteId, formaPag, ref.ano, ref.mes, ref.todos]);

  function limparFiltros() {
    setStatus(''); setBusca(''); setMarca(''); setClienteId(''); setFormaPag('');
  }
  const temFiltroAtivo = status || busca || marca || clienteId || formaPag;

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  useEffect(() => {
    if (!expandidaId) { setExpandida(null); return; }
    let vivo = true;
    setCarregandoExpansao(true); setExpandida(null);
    api.ordem(expandidaId)
      .then((o) => { if (vivo) setExpandida(o); })
      .catch((e) => { if (vivo) setErro(e.message); })
      .finally(() => { if (vivo) setCarregandoExpansao(false); });
    return () => { vivo = false; };
  }, [expandidaId]);

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
            {[['lista', '☰ Lista'], ['kanban', '▦ Kanban']].map(([k, t]) => (
              <button key={k} onClick={() => setVista(k)}
                className={`rounded px-3 py-1.5 text-xs font-semibold transition
                  ${vista === k ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => setNovaAberta(true)}>+ Nova ordem</button>
        </div>
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

      {/* Filtros extras */}
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto min-w-[140px] max-w-[220px] py-1.5 text-xs"
          value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>#{c.numero_cliente} — {c.nome}</option>
          ))}
        </select>
        <select className="input w-auto min-w-[120px] py-1.5 text-xs"
          value={marca} onChange={(e) => setMarca(e.target.value)}>
          <option value="">Todas as marcas</option>
          {MARCAS.map((m) => <option key={m.nome} value={m.nome}>{m.nome}</option>)}
        </select>
        <select className="input w-auto min-w-[140px] py-1.5 text-xs"
          value={formaPag} onChange={(e) => setFormaPag(e.target.value)}>
          <option value="">Qualquer forma de pagto.</option>
          {FORMAS_PAGAMENTO.map((f) => (
            <option key={f.valor} value={f.valor}>{f.rotulo}</option>
          ))}
        </select>
        {temFiltroAtivo && (
          <button onClick={limparFiltros}
            className="rounded bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100">
            ✕ Limpar filtros
          </button>
        )}
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {!lista ? (
        <div className="card space-y-2 p-4">
          {[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : lista.dados.length === 0 ? (
        <div className="card p-6">
          <Vazio titulo="Nenhuma ordem encontrada"
            descricao={busca || status ? 'Tente mudar o filtro ou a busca.' : 'Nenhuma ordem neste mês.'}
            acao={<button className="btn-primary mt-3" onClick={() => setNovaAberta(true)}>+ Nova ordem</button>} />
        </div>
      ) : vista === 'kanban' ? (
        <KanbanOS ordens={lista.dados} onCard={setDetalhe} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/80">
                <tr>
                  <th className="th w-8"></th>
                  <th className="th w-16">Nº</th>
                  <th className="th">Cliente</th>
                  <th className="th">Veículo</th>
                  <th className="th w-28">Aberta</th>
                  <th className="th w-32">Status</th>
                  <th className="th w-28 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.dados.map((o) => {
                  const aberto = expandidaId === o.id;
                  return (
                    <React.Fragment key={o.id}>
                      <tr onClick={() => setExpandidaId(aberto ? null : o.id)}
                        className={`cursor-pointer transition
                          ${aberto ? 'bg-maninho-50/70' : 'hover:bg-maninho-50/40'}`}>
                        <td className="td text-center text-slate-400">{aberto ? '▾' : '▸'}</td>
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
                        <td className="td">
                          <StatusInline os={o}
                            onMudar={async (osAlvo, novoStatus) => {
                              try {
                                await api.mudarStatus(osAlvo.id, novoStatus, false);
                                carregar();
                              } catch (e) { setErro(e.message); }
                            }}
                            onPagar={(osAlvo) => setPagando(osAlvo)} />
                        </td>
                        <td className="td tnum text-right font-semibold text-slate-800">{brl(o.valor_total)}</td>
                      </tr>
                      {aberto && (
                        <tr className="bg-maninho-50/30">
                          <td colSpan={7} className="px-4 py-3">
                            <PreviewOS os={expandida} carregando={carregandoExpansao}
                              onAbrirModal={() => setDetalhe(o)}
                              onNovoRetorno={() => setNovoRetorno(expandida || o)} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
        onPagar={(o) => { setDetalhe(null); setPagando(o); }}
        onExcluida={() => { setDetalhe(null); carregar(); }} />

      <PagarOS os={pagando} onFechar={() => setPagando(null)}
        onPago={() => { setPagando(null); carregar(); }} />

      <NovoRetornoDaOS os={novoRetorno} onFechar={() => setNovoRetorno(null)}
        onCriado={() => { setNovoRetorno(null); }} />
    </div>
  );
}
