import { useEffect, useState } from 'react';
import { api, getUser } from '../lib/api';
import { Skeleton, Alerta, Vazio, Modal, Campo, Spinner } from '../components/ui';

const ROLE_LABEL = { admin: 'Admin', atendente: 'Atendente', basico: 'Básico' };
const ROLE_BADGE = {
  admin: 'bg-maninho-100 text-maninho-800',
  atendente: 'bg-sky-100 text-sky-800',
  basico: 'bg-slate-200 text-slate-700',
};

function FormUsuario({ usuario, onFechar, onSalvo }) {
  const editando = !!usuario;
  const euId = getUser()?.id;
  const ehEu = editando && usuario.id === euId;

  const [form, setForm] = useState(
    editando
      ? { nome: usuario.nome, email: usuario.email, role: usuario.role, ativo: usuario.ativo, senha: '' }
      : { nome: '', email: '', role: 'atendente', ativo: true, senha: '' },
  );
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try {
      if (editando) {
        const body = { nome: form.nome, role: form.role, ativo: form.ativo === true || form.ativo === 'true' };
        if (form.senha) body.senha = form.senha;
        await onSalvo(api.atualizarUsuario(usuario.id, body));
      } else {
        await onSalvo(api.criarUsuario({
          nome: form.nome, email: form.email, senha: form.senha, role: form.role,
        }));
      }
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <Modal aberto largura="max-w-md"
      titulo={editando ? `Editar · ${usuario.nome}` : 'Novo usuário'} onFechar={onFechar}>
      <form onSubmit={salvar} className="space-y-4">
        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        <Campo label="Nome" obrigatorio>
          <input className="input" value={form.nome} onChange={set('nome')} required autoFocus />
        </Campo>

        <Campo label="E-mail" obrigatorio={!editando}
          ajuda={editando ? 'O e-mail não pode ser alterado' : undefined}>
          <input type="email" className="input" value={form.email}
            onChange={set('email')} required={!editando} disabled={editando} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Papel" obrigatorio>
            <select className="input" value={form.role} onChange={set('role')}
              disabled={ehEu}>
              <option value="admin">Admin</option>
              <option value="atendente">Atendente</option>
              <option value="basico">Básico</option>
            </select>
          </Campo>
          {editando && (
            <Campo label="Ativo">
              <select className="input" value={String(form.ativo)}
                onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.value === 'true' }))}
                disabled={ehEu}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </Campo>
          )}
        </div>

        <Campo label={editando ? 'Nova senha' : 'Senha'} obrigatorio={!editando}
          ajuda={editando ? 'Deixe em branco pra manter a atual' : 'Mínimo 8 caracteres'}>
          <input type="text" className="input font-mono" value={form.senha}
            onChange={set('senha')} required={!editando} minLength={editando ? undefined : 8} maxLength={100} />
        </Campo>

        {ehEu && (
          <p className="text-[11px] text-slate-500">
            Este é o seu usuário — por segurança, não dá pra rebaixar o próprio papel ou se desativar.
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

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState(null);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState(null); // objeto usuário ou {} pra novo
  const euId = getUser()?.id;

  function carregar() {
    setErro('');
    api.usuarios().then(setUsuarios).catch((e) => setErro(e.message));
  }
  useEffect(carregar, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
            Equipe
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Usuários que acessam o sistema desta oficina.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditando({})}>+ Novo usuário</button>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

      {!usuarios ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : usuarios.length === 0 ? (
        <Vazio titulo="Nenhum usuário" descricao="Cadastre o primeiro com o botão acima." />
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <li key={u.id} className={`flex items-center gap-3 px-4 py-3 ${u.ativo ? '' : 'opacity-50'}`}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800">
                    {u.nome}
                    {u.id === euId && <span className="ml-2 text-[11px] font-normal text-slate-400">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{u.email}</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[u.role] || ''}`}>
                  {ROLE_LABEL[u.role] || u.role}
                </span>
                {!u.ativo && <span className="text-[11px] text-rose-600">inativo</span>}
                <button onClick={() => setEditando(u)}
                  className="rounded px-2 py-1 text-xs font-semibold text-maninho-600 hover:bg-maninho-50">
                  Editar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editando && (
        <FormUsuario
          usuario={editando.id ? editando : null}
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
