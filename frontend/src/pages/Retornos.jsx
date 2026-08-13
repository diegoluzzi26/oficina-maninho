import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { data, telefone, hojeISO } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

const ABAS = [
  { chave: 'pendente', texto: 'Pendentes' },
  { chave: 'contatado', texto: 'Contatados' },
  { chave: 'ignorado', texto: 'Ignorados' },
];

function Chip({ dias }) {
  if (dias < 0) return (
    <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
      {-dias}d atrasado
    </span>
  );
  if (dias === 0) return (
    <span className="rounded bg-ouro-100 px-2 py-0.5 text-[11px] font-semibold text-ouro-700">
      hoje
    </span>
  );
  if (dias <= 7) return (
    <span className="rounded bg-maninho-50 px-2 py-0.5 text-[11px] font-semibold text-maninho-700">
      em {dias}d
    </span>
  );
  return (
    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
      em {dias}d
    </span>
  );
}

function NovoRetorno({ aberto, onFechar, onCriado }) {
  const [buscaCliente, setBuscaCliente] = useState('');
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [carros, setCarros] = useState([]);
  const [carroId, setCarroId] = useState('');
  const [agendado, setAgendado] = useState(hojeISO());
  const [motivo, setMotivo] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(() => {
      api.clientes({ por_pagina: 100, busca: buscaCliente })
        .then((c) => setClientes(c.dados))
        .catch((e) => setErro(e.message));
    }, buscaCliente ? 300 : 0);
    return () => clearTimeout(t);
  }, [aberto, buscaCliente]);

  useEffect(() => {
    if (!clienteId) { setCarros([]); setCarroId(''); return; }
    api.cliente(clienteId)
      .then((c) => {
        setCarros(c.carros || []);
        setCarroId(c.carros?.length === 1 ? c.carros[0].id : '');
      })
      .catch((e) => setErro(e.message));
  }, [clienteId]);

  function limpar() {
    setBuscaCliente(''); setClienteId(''); setCarros([]); setCarroId('');
    setAgendado(hojeISO()); setMotivo(''); setObs(''); setErro('');
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const criado = await api.criarRetorno({
        cliente_id: clienteId,
        carro_id: carroId || null,
        agendado_para: agendado,
        motivo: motivo || null,
        nome_servico: motivo || null,
        observacao: obs || null,
      });
      limpar();
      onCriado(criado);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} onFechar={() => { limpar(); onFechar(); }}
      titulo="Novo retorno manual" largura="max-w-lg">
      <form onSubmit={salvar} className="space-y-3">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Buscar cliente">
          <input className="input" value={buscaCliente} placeholder="Nome, telefone, placa…"
            onChange={(e) => setBuscaCliente(e.target.value)} />
        </Campo>

        <Campo label="Cliente" obrigatorio>
          <select className="input" value={clienteId}
            onChange={(e) => setClienteId(e.target.value)} required>
            <option value="">Selecione…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>#{c.numero_cliente} — {c.nome}</option>
            ))}
          </select>
        </Campo>

        {carros.length > 0 && (
          <Campo label="Veículo">
            <select className="input" value={carroId}
              onChange={(e) => setCarroId(e.target.value)}>
              <option value="">— sem veículo específico —</option>
              {carros.map((ca) => (
                <option key={ca.id} value={ca.id}>{ca.placa} — {ca.marca} {ca.modelo}</option>
              ))}
            </select>
          </Campo>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Agendado para" obrigatorio>
            <input type="date" className="input" value={agendado}
              onChange={(e) => setAgendado(e.target.value)} required />
          </Campo>
          <Campo label="Motivo / serviço">
            <input className="input" value={motivo} placeholder="Ex.: troca de óleo"
              onChange={(e) => setMotivo(e.target.value)} />
          </Campo>
        </div>

        <Campo label="Observação">
          <textarea className="input" rows={3} value={obs}
            placeholder="Ex.: ligar depois das 14h; prefere WhatsApp"
            onChange={(e) => setObs(e.target.value)} />
        </Campo>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => { limpar(); onFechar(); }}
            className="btn-ghost px-3 py-1.5 text-sm">Cancelar</button>
          <button type="submit" className="btn-primary px-4 py-1.5 text-sm"
            disabled={salvando || !clienteId || !agendado}>
            {salvando ? <Spinner className="h-4 w-4" /> : 'Criar retorno'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditarRetorno({ retorno, onFechar, onSalvo }) {
  const [agendado, setAgendado] = useState(retorno?.agendado_para?.slice(0, 10) || '');
  const [motivo, setMotivo] = useState(retorno?.motivo || retorno?.servico_nome || '');
  const [obs, setObs] = useState(retorno?.observacao || '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!retorno) return;
    setAgendado(retorno.agendado_para?.slice(0, 10) || '');
    setMotivo(retorno.motivo || retorno.servico_nome || '');
    setObs(retorno.observacao || '');
    setErro('');
  }, [retorno]);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const atualizado = await api.atualizarRetorno(retorno.id, {
        agendado_para: agendado,
        motivo: motivo || null,
        observacao: obs || null,
      });
      onSalvo(atualizado);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={!!retorno} onFechar={onFechar}
      titulo={`Retorno — ${retorno?.cliente_nome || ''}`} largura="max-w-md">
      {retorno && (
        <form onSubmit={salvar} className="space-y-3">
          {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Agendado para">
              <input type="date" className="input" value={agendado}
                onChange={(e) => setAgendado(e.target.value)} />
            </Campo>
            <Campo label="Motivo / serviço">
              <input className="input" value={motivo}
                onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
          </div>

          <Campo label="Observação">
            <textarea className="input" rows={4} value={obs}
              placeholder="Anotação livre do atendente"
              onChange={(e) => setObs(e.target.value)} />
          </Campo>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onFechar}
              className="btn-ghost px-3 py-1.5 text-sm">Fechar</button>
            <button type="submit" className="btn-primary px-4 py-1.5 text-sm" disabled={salvando}>
              {salvando ? <Spinner className="h-4 w-4" /> : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function Retornos() {
  const [aba, setAba] = useState('pendente');
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState(null);

  const carregar = useCallback(() => {
    setErro('');
    api.retornos({ status: aba, busca })
      .then(setLista).catch((e) => setErro(e.message));
  }, [aba, busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  async function contatar(r) {
    setErro('');
    try {
      await api.marcarRetornoContatado(r.id);
      carregar();
    } catch (e) { setErro(e.message); }
  }
  async function enviarWhatsApp(r) {
    setErro('');
    try {
      await api.enviarWhatsAppRetorno(r.id);
      carregar();
    } catch (e) { setErro(`WhatsApp não enviado: ${e.message}`); }
  }
  async function ignorar(r) {
    setErro('');
    try {
      await api.ignorarRetorno(r.id);
      carregar();
    } catch (e) { setErro(e.message); }
  }
  async function remover(r) {
    if (!confirm(`Remover o retorno de ${r.cliente_nome}?`)) return;
    setErro('');
    try {
      await api.removerRetorno(r.id);
      carregar();
    } catch (e) { setErro(e.message); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Retornos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Clientes para chamar de volta com base no intervalo configurado no catálogo (ex: troca de óleo → 6 meses).
          </p>
        </div>
        <button className="btn-primary" onClick={() => setNovoAberto(true)}>+ Novo retorno</button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5 shadow-sm">
          {ABAS.map((a) => (
            <button key={a.chave} onClick={() => setAba(a.chave)}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition
                ${aba === a.chave ? 'bg-maninho-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {a.texto}
            </button>
          ))}
        </div>
        <input className="input max-w-xs" placeholder="Buscar cliente, placa ou serviço…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      <div className="card overflow-hidden">
        {!lista ? (
          <div className="space-y-2 p-4">
            {[0,1,2,3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : lista.length === 0 ? (
          <Vazio titulo={aba === 'pendente' ? 'Nenhum retorno pendente' : 'Nada aqui'}
            descricao={aba === 'pendente'
              ? 'Configure o intervalo de retorno em serviços do catálogo (ex: troca de óleo → 6 meses).'
              : ''} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/80">
                <tr>
                  <th className="th">Cliente</th>
                  <th className="th">Serviço</th>
                  <th className="th w-24">Placa</th>
                  <th className="th w-28">Data</th>
                  <th className="th w-28">Situação</th>
                  <th className="th w-40 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((r) => (
                  <tr key={r.id} className="hover:bg-maninho-50/40">
                    <td className="td">
                      <p className="font-medium text-slate-800">{r.cliente_nome}</p>
                      <p className="text-xs text-slate-500">{telefone(r.cliente_telefone)}</p>
                    </td>
                    <td className="td text-sm text-slate-700">
                      {r.servico_nome || r.motivo || '—'}
                      {r.observacao && (
                        <p className="mt-0.5 text-[11px] italic text-slate-500">obs: {r.observacao}</p>
                      )}
                    </td>
                    <td className="td font-mono text-xs font-semibold text-slate-700">{r.placa || '—'}</td>
                    <td className="td text-xs text-slate-600">{data(r.agendado_para)}</td>
                    <td className="td">
                      {aba === 'pendente'
                        ? <Chip dias={r.dias_para} />
                        : (
                          <span className="text-xs text-slate-500">
                            {aba === 'contatado' ? `contatado ${r.contatado_em ? data(r.contatado_em) : ''}` : 'ignorado'}
                          </span>
                        )}
                    </td>
                    <td className="td text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button onClick={() => setEditando(r)}
                          className="rounded bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          title="Editar data / motivo / observação">
                          ✎ Editar
                        </button>
                        {aba === 'pendente' ? (
                          <>
                            <button onClick={() => enviarWhatsApp(r)}
                              className="rounded bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-200"
                              title="Envia lembrete e marca como contatado">
                              WhatsApp
                            </button>
                            <button onClick={() => contatar(r)}
                              className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                              title="Marca como contatado sem enviar mensagem">
                              ✓ Contatado
                            </button>
                            <button onClick={() => ignorar(r)}
                              className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200">
                              Ignorar
                            </button>
                          </>
                        ) : (
                          <button onClick={() => remover(r)}
                            className="rounded bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100">
                            Remover
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NovoRetorno aberto={novoAberto} onFechar={() => setNovoAberto(false)}
        onCriado={() => { setNovoAberto(false); carregar(); }} />
      <EditarRetorno retorno={editando} onFechar={() => setEditando(null)}
        onSalvo={() => { setEditando(null); carregar(); }} />
    </div>
  );
}
