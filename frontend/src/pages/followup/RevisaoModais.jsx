import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { hojeISO } from '../../lib/format';
import { Alerta, Modal, Campo, Spinner } from '../../components/ui';

/** Modais para agendar e editar uma revisão (tabela retornos). */

export function NovoRetorno({ aberto, onFechar, onCriado }) {
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
      titulo="Agendar revisão" largura="max-w-lg">
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
            {salvando ? <Spinner className="h-4 w-4" /> : 'Agendar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EditarRetorno({ retorno, onFechar, onSalvo }) {
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
      titulo={`Revisão de ${retorno?.cliente_nome || ''}`} largura="max-w-md">
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

