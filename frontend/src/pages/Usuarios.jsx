import { useEffect, useState } from 'react';
import { api, getUser } from '../lib/api';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

const ROLE_LABEL = { admin: 'Admin', atendente: 'Atendente', basico: 'Básico' };
const ROLE_BADGE = {
  admin: 'bg-maninho-100 text-maninho-800',
  atendente: 'bg-sky-100 text-sky-800',
  basico: 'bg-slate-200 text-slate-700',
};
const ROLE_AJUDA = {
  admin: 'Acesso total, inclusive Equipe, Plano e Configurações.',
  atendente: 'Balcão: começa com tudo liberado, menos as telas de admin.',
  basico: 'Mecânico: começa só com Agenda e Ordens.',
};

/** Caixas de permissão por módulo (só pra quem não é admin). */
function Permissoes({ modulos, marcadas, onChange }) {
  const alterna = (chave) => onChange(
    marcadas.includes(chave) ? marcadas.filter((c) => c !== chave) : [...marcadas, chave],
  );
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {modulos.map((m) => (
        <label key={m.chave}
          className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition
            ${marcadas.includes(m.chave)
              ? 'border-maninho-300 bg-maninho-50/60'
              : 'border-slate-200 hover:border-slate-300'}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-maninho-600"
            checked={marcadas.includes(m.chave)} onChange={() => alterna(m.chave)} />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-800">{m.nome}</span>
            <span className="block text-[11px] leading-snug text-slate-500">{m.descricao}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function FormUsuario({ usuario, catalogo, onFechar, onSalvo }) {
  const editando = !!usuario;
  const euId = getUser()?.id;
  const ehEu = editando && usuario.id === euId;

  const [form, setForm] = useState(
    editando
      ? { nome: usuario.nome, email: usuario.email, role: usuario.role, ativo: usuario.ativo, senha: '' }
      : { nome: '', email: '', role: 'atendente', ativo: true, senha: '' },
  );
  const [perms, setPerms] = useState(
    editando ? usuario.permissoes : (catalogo.padrao.atendente || []),
  );
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Trocar o papel recarrega as permissões padrão dele (dá pra ajustar depois).
  function trocarPapel(e) {
    const role = e.target.value;
    setForm((f) => ({ ...f, role }));
    setPerms(catalogo.padrao[role] || []);
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    // Admin tem tudo sempre: não grava lista pra ele.
    const permissoes = form.role === 'admin' ? null : perms;
    try {
      if (editando) {
        const body = {
          nome: form.nome, role: form.role, permissoes,
          ativo: form.ativo === true || form.ativo === 'true',
        };
        if (form.senha) body.senha = form.senha;
        await onSalvo(api.atualizarUsuario(usuario.id, body));
      } else {
        await onSalvo(api.criarUsuario({
          nome: form.nome, email: form.email, senha: form.senha, role: form.role, permissoes,
        }));
      }
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto largura="max-w-2xl"
      titulo={editando ? `Editar · ${usuario.nome}` : 'Novo usuário'} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome" obrigatorio>
            <input className="input" value={form.nome} onChange={set('nome')} required autoFocus />
          </Campo>
          <Campo label="E-mail (login)" obrigatorio={!editando}
            ajuda={editando ? 'O e-mail não pode ser alterado' : undefined}>
            <input type="email" className="input" value={form.email}
              onChange={set('email')} required={!editando} disabled={editando} />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Papel" obrigatorio ajuda={ROLE_AJUDA[form.role]}>
            <select className="input" value={form.role} onChange={trocarPapel} disabled={ehEu}>
              <option value="admin">Admin</option>
              <option value="atendente">Atendente</option>
              <option value="basico">Básico</option>
            </select>
          </Campo>
          <Campo label={editando ? 'Nova senha' : 'Senha'} obrigatorio={!editando}
            ajuda={editando ? 'Deixe em branco pra manter a atual' : 'Mínimo 8 caracteres'}>
            <input type="text" className="input font-mono" value={form.senha}
              onChange={set('senha')} required={!editando} minLength={editando ? undefined : 8} maxLength={100} />
          </Campo>
        </div>

        {form.role === 'admin' ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Admin enxerga e faz tudo na oficina. Pra limitar o acesso, escolha Atendente ou Básico.
          </p>
        ) : (
          <div>
            <div className="mb-2 flex items-end justify-between gap-2">
              <p className="label">O que este usuário pode acessar</p>
              <div className="flex gap-2 text-[11px] font-semibold">
                <button type="button" className="text-maninho-600 hover:underline"
                  onClick={() => setPerms(catalogo.modulos.map((m) => m.chave))}>Marcar tudo</button>
                <button type="button" className="text-slate-500 hover:underline"
                  onClick={() => setPerms([])}>Limpar</button>
              </div>
            </div>
            <Permissoes modulos={catalogo.modulos} marcadas={perms} onChange={setPerms} />
          </div>
        )}

        {editando && (
          <Campo label="Ativo">
            <select className="input w-40" value={String(form.ativo)}
              onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.value === 'true' }))}
              disabled={ehEu}>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </Campo>
        )}

        {ehEu && (
          <p className="text-[11px] text-slate-500">
            Este é o seu usuário. Por segurança, não dá pra rebaixar o próprio papel ou se desativar.
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : (editando ? 'Salvar' : 'Criar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** "3 de 5 usuários" com barrinha; ilimitado só mostra o total. */
function Limite({ dados }) {
  const { ativos, limite, plano } = dados;
  if (limite == null) {
    return <p className="text-sm text-slate-500">{ativos} usuário(s) ativo(s) · plano {plano} sem limite</p>;
  }
  const cheio = ativos >= limite;
  return (
    <div className="min-w-[220px]">
      <p className="text-sm text-slate-600">
        <strong className={cheio ? 'text-rose-600' : 'text-slate-800'}>{ativos} de {limite}</strong>
        {' '}usuários ativos · plano {plano}
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${cheio ? 'bg-rose-500' : 'bg-maninho-600'}`}
          style={{ width: `${Math.min(100, (ativos / limite) * 100)}%` }} />
      </div>
    </div>
  );
}

export default function Usuarios() {
  const [dados, setDados] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null); // objeto usuário ou {} pra novo
  const euId = getUser()?.id;

  function carregar() {
    setErro('');
    api.usuarios().then(setDados).catch((e) => setErro(e.message));
  }
  useEffect(() => {
    carregar();
    api.minhasPermissoes().then(setCatalogo).catch((e) => setErro(e.message));
  }, []);

  const usuarios = dados?.usuarios;
  const lotado = dados && dados.limite != null && dados.ativos >= dados.limite;
  const nomeModulo = (chave) => catalogo?.modulos.find((m) => m.chave === chave)?.nome || chave;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Equipe
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Crie o login de cada pessoa e escolha o que ela pode acessar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {dados && <Limite dados={dados} />}
          <button className="btn-primary" onClick={() => setEditando({})}
            disabled={!catalogo || lotado}
            title={lotado ? 'Limite de usuários do plano atingido' : undefined}>
            + Novo usuário
          </button>
        </div>
      </div>

      {lotado && (
        <Alerta tipo="aviso">
          Sua oficina chegou no limite de {dados.limite} usuários ativos do plano {dados.plano}.
          Desative alguém ou troque de plano em <strong>Plano</strong> pra liberar mais logins.
        </Alerta>
      )}
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!usuarios ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : usuarios.length === 0 ? (
        <Vazio titulo="Nenhum usuário" descricao="Cadastre o primeiro com o botão acima." />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <li key={u.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${u.ativo ? '' : 'opacity-50'}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">
                    {u.nome}
                    {u.id === euId && <span className="ml-2 text-[11px] font-normal text-slate-400">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{u.email}</p>
                  {u.role !== 'admin' && catalogo && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      {u.permissoes.length
                        ? u.permissoes.map(nomeModulo).join(' · ')
                        : 'Nenhuma área liberada'}
                    </p>
                  )}
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[u.role] || ''}`}>
                  {ROLE_LABEL[u.role] || u.role}
                </span>
                {!u.ativo && <span className="text-[11px] text-rose-600">inativo</span>}
                <button onClick={() => setEditando(u)} disabled={!catalogo}
                  className="rounded px-2 py-1 text-xs font-semibold text-maninho-600 hover:bg-maninho-50">
                  Editar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editando && catalogo && (
        <FormUsuario
          usuario={editando.id ? editando : null}
          catalogo={catalogo}
          onFechar={() => setEditando(null)}
          onSalvo={async (promessa) => {
            await promessa;
            setEditando(null);
            carregar();
          }} />
      )}
    </div>
  );
}
