import { useEffect, useState, useCallback } from 'react';
import { api, getUser } from '../lib/api';
import { brl, data, telefone } from '../lib/format';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner, Badge } from '../components/ui';

function FormCliente({ aberto, cliente, onFechar, onSalvo }) {
  const vazio = { nome: '', telefone: '', cpf_cnpj: '', email: '', endereco: '', observacoes: '' };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setForm(cliente ? { ...vazio, ...cliente } : vazio);
    setErro('');
  }, [cliente, aberto]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const body = {
        nome: form.nome,
        telefone: form.telefone,
        cpf_cnpj: form.cpf_cnpj || null,
        email: form.email || null,
        endereco: form.endereco || null,
        observacoes: form.observacoes || null,
      };
      const salvo = cliente
        ? await api.atualizarCliente(cliente.id, body)
        : await api.criarCliente(body);
      onSalvo(salvo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar}
      titulo={cliente ? `Editar cliente #${cliente.numero_cliente}` : 'Novo cliente'}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')} required autoFocus
            placeholder="João da Silva" />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Telefone (WhatsApp)" obrigatorio>
            <input className="input" value={form.telefone} onChange={set('telefone')} required
              placeholder="(51) 99888-7777" />
          </Campo>
          <Campo label="CPF / CNPJ">
            <input className="input" value={form.cpf_cnpj || ''} onChange={set('cpf_cnpj')}
              placeholder="123.456.789-00" />
          </Campo>
        </div>

        <Campo label="E-mail">
          <input type="email" className="input" value={form.email || ''} onChange={set('email')}
            placeholder="joao@email.com" />
        </Campo>

        <Campo label="Endereço">
          <input className="input" value={form.endereco || ''} onChange={set('endereco')}
            placeholder="RS-020, 1055 — Gravataí/RS" />
        </Campo>

        <Campo label="Observações">
          <textarea className="input min-h-[70px] resize-y" value={form.observacoes || ''}
            onChange={set('observacoes')} placeholder="Prefere ser avisado à tarde" />
        </Campo>

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

function FormCarro({ aberto, clienteId, onFechar, onSalvo }) {
  const vazio = { placa: '', marca: '', modelo: '', ano: '', cor: '', km_atual: '', chassi: '' };
  const [form, setForm] = useState(vazio);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { setForm(vazio); setErro(''); }, [aberto]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      const salvo = await api.criarCarro({
        cliente_id: clienteId,
        placa: form.placa,
        marca: form.marca,
        modelo: form.modelo,
        ano: form.ano ? Number(form.ano) : null,
        cor: form.cor || null,
        km_atual: form.km_atual ? Number(form.km_atual) : null,
        chassi: form.chassi || null,
      });
      onSalvo(salvo);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto={aberto} titulo="Adicionar veículo" onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Placa" obrigatorio>
            <input className="input font-mono uppercase" value={form.placa} onChange={set('placa')}
              required placeholder="ABC1D23" maxLength={8} />
          </Campo>
          <Campo label="Ano">
            <input type="number" className="input" value={form.ano} onChange={set('ano')}
              placeholder="2015" min="1900" max="2100" />
          </Campo>
          <Campo label="Marca" obrigatorio>
            <input className="input" value={form.marca} onChange={set('marca')} required
              placeholder="Volkswagen" />
          </Campo>
          <Campo label="Modelo" obrigatorio>
            <input className="input" value={form.modelo} onChange={set('modelo')} required
              placeholder="Jetta" />
          </Campo>
          <Campo label="Cor">
            <input className="input" value={form.cor} onChange={set('cor')} placeholder="Branco" />
          </Campo>
          <Campo label="KM atual">
            <input type="number" min="0" className="input" value={form.km_atual}
              onChange={set('km_atual')} placeholder="120000" />
          </Campo>
        </div>

        <Campo label="Chassi">
          <input className="input font-mono uppercase" value={form.chassi} onChange={set('chassi')}
            placeholder="17 caracteres" maxLength={17} />
        </Campo>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Adicionar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetalheCliente({ id, onFechar, onAtualizado }) {
  const [cli, setCli] = useState(null);
  const [ordens, setOrdens] = useState([]);
  const [carroAberto, setCarroAberto] = useState(false);
  const [erro, setErro] = useState('');

  const recarregar = useCallback(() => {
    if (!id) return;
    Promise.all([api.cliente(id), api.ordens({ cliente_id: id, por_pagina: 10 })])
      .then(([c, o]) => { setCli(c); setOrdens(o.dados); })
      .catch((e) => setErro(e.message));
  }, [id]);

  useEffect(() => { recarregar(); }, [recarregar]);

  if (!id) return null;

  return (
    <Modal aberto largura="max-w-2xl" onFechar={onFechar}
      titulo={cli ? `#${cli.numero_cliente} — ${cli.nome}` : 'Carregando…'}>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {!cli ? <Skeleton className="h-48" /> : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-md bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <div><p className="label">Telefone</p><p>{telefone(cli.telefone)}</p></div>
            <div><p className="label">CPF/CNPJ</p><p>{cli.cpf_cnpj || '—'}</p></div>
            <div><p className="label">E-mail</p><p className="break-all">{cli.email || '—'}</p></div>
            <div><p className="label">Cliente desde</p><p>{data(cli.criado_em)}</p></div>
            {cli.endereco && (
              <div className="sm:col-span-2"><p className="label">Endereço</p><p>{cli.endereco}</p></div>
            )}
            {cli.observacoes && (
              <div className="sm:col-span-2">
                <p className="label">Observações</p><p className="text-slate-600">{cli.observacoes}</p>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label">Veículos ({cli.carros.length})</p>
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setCarroAberto(true)}>
                + Adicionar
              </button>
            </div>
            {cli.carros.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">
                Nenhum veículo cadastrado
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {cli.carros.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2.5">
                    <div>
                      <p className="font-mono text-sm font-semibold text-slate-800">{c.placa}</p>
                      <p className="text-xs text-slate-500">
                        {c.marca} {c.modelo}{c.ano ? ` · ${c.ano}` : ''}{c.cor ? ` · ${c.cor}` : ''}
                      </p>
                    </div>
                    {c.km_atual != null && (
                      <span className="tnum text-xs text-slate-500">
                        {Number(c.km_atual).toLocaleString('pt-BR')} km
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="label mb-2">Últimas ordens</p>
            {ordens.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 py-4 text-center text-xs text-slate-400">
                Nenhuma ordem registrada
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {ordens.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="tnum text-xs font-bold text-maninho-600">#{o.numero_os}</span>
                    <span className="flex-1 text-xs text-slate-500">{data(o.aberta_em)} · {o.placa}</span>
                    <Badge status={o.status} />
                    <span className="tnum w-24 text-right text-sm font-semibold">{brl(o.valor_total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <FormCarro aberto={carroAberto} clienteId={id} onFechar={() => setCarroAberto(false)}
        onSalvo={() => { setCarroAberto(false); recarregar(); onAtualizado?.(); }} />
    </Modal>
  );
}

export default function Clientes() {
  const [lista, setLista] = useState(null);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [detalheId, setDetalheId] = useState(null);
  const usuario = getUser();

  const carregar = useCallback(() => {
    setErro('');
    api.clientes({ busca, por_pagina: 50 })
      .then(setLista)
      .catch((e) => setErro(e.message));
  }, [busca]);

  useEffect(() => {
    const t = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [carregar, busca]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">Clientes</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {lista ? `${lista.paginacao.total} cadastrados` : 'Carregando…'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditando(null); setFormAberto(true); }}>
          + Novo cliente
        </button>
      </div>

      <input className="input max-w-sm" placeholder="Buscar por nome, telefone, CPF ou nº"
        value={busca} onChange={(e) => setBusca(e.target.value)} />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="card overflow-hidden">
        {!lista ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
          </div>
        ) : lista.dados.length === 0 ? (
          <Vazio titulo="Nenhum cliente encontrado"
            descricao={busca ? 'Tente outro termo de busca.' : 'Cadastre o primeiro cliente.'}
            acao={<button className="btn-primary mt-3" onClick={() => setFormAberto(true)}>+ Novo cliente</button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/80">
                <tr>
                  <th className="th w-16">Nº</th>
                  <th className="th">Nome</th>
                  <th className="th w-40">Telefone</th>
                  <th className="th w-20 text-center">Veículos</th>
                  <th className="th w-20 text-center">Ordens</th>
                  <th className="th w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lista.dados.map((c) => (
                  <tr key={c.id} className="transition hover:bg-maninho-50/60">
                    <td className="td tnum font-semibold text-maninho-600">{c.numero_cliente}</td>
                    <td className="td">
                      <button onClick={() => setDetalheId(c.id)}
                        className="font-medium text-slate-800 hover:text-maninho-600 hover:underline">
                        {c.nome}
                      </button>
                      {c.cpf_cnpj && <p className="text-xs text-slate-500">{c.cpf_cnpj}</p>}
                    </td>
                    <td className="td text-slate-600">{telefone(c.telefone)}</td>
                    <td className="td tnum text-center text-slate-600">{c.qtd_carros}</td>
                    <td className="td tnum text-center text-slate-600">{c.qtd_os}</td>
                    <td className="td text-right">
                      <button onClick={() => { setEditando(c); setFormAberto(true); }}
                        className="text-xs font-semibold text-maninho-600 hover:underline">
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormCliente aberto={formAberto} cliente={editando}
        onFechar={() => { setFormAberto(false); setEditando(null); }}
        onSalvo={() => { setFormAberto(false); setEditando(null); carregar(); }} />

      {detalheId && (
        <DetalheCliente id={detalheId} onFechar={() => setDetalheId(null)} onAtualizado={carregar} />
      )}
    </div>
  );
}
