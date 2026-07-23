import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alerta, Campo, Skeleton, Spinner } from '../components/ui';

/**
 * Configurações do sistema — hoje só WhatsApp. Só admin acessa
 * (o backend recusa com 403 pra não-admin; o menu esconde o link também).
 *
 * Segredos (token, verify_token) chegam mascarados do backend. Ao editar,
 * a UI escreve `••••` como placeholder e o backend interpreta:
 *   - campo vazio na resposta = "não mexer no valor atual"
 *   - o cadeado ao lado do campo destrava a edição
 */

const CAMPOS_SECRETOS = new Set(['token', 'verify_token']);

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

export default function Configuracoes() {
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState({
    setup: {}, templates: {}, alerta: {}, meta: {},
  });
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { carregar(); }, []);

  function carregar() {
    setErro('');
    api.configWhatsApp()
      .then((d) => {
        setDados(d);
        setForm({ setup: {}, templates: {}, alerta: {}, meta: {} });
      })
      .catch((e) => setErro(e.message));
  }

  const set = (grupo, campo) => (v) =>
    setForm((f) => ({ ...f, [grupo]: { ...f[grupo], [campo]: v } }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true); setErro(''); setOk('');

    // Remove campos secretos vazios pra não sobrescrever com "" —
    // o backend já faz isso, mas evita mandar payload desnecessário.
    const body = {
      setup: { ...form.setup },
      templates: { ...form.templates },
      alerta: { ...form.alerta },
      meta: { ...form.meta },
    };
    for (const k of CAMPOS_SECRETOS) {
      if (body.setup[k] === '') delete body.setup[k];
    }

    try {
      const atualizado = await api.salvarConfigWhatsApp(body);
      setDados(atualizado);
      setForm({ setup: {}, templates: {}, alerta: {}, meta: {} });
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

  // Valor efetivo do input = o que o usuário digitou (form) OR o valor atual
  const v = (grupo, campo) =>
    form[grupo][campo] !== undefined ? form[grupo][campo] : (dados[grupo][campo] ?? '');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-[26px] font-semibold uppercase tracking-wide text-maninho-800">
          Configurações
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Ajuste o WhatsApp da oficina sem precisar mexer no <code>.env</code> nem reiniciar o sistema.
        </p>
      </div>

      {/* Status */}
      <div className={`card p-4 border-l-4 ${dados.enabled ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
        <p className="font-display text-sm font-semibold uppercase tracking-wide">
          Status:{' '}
          {dados.enabled
            ? <span className="text-emerald-700">WhatsApp configurado e ativo</span>
            : <span className="text-rose-700">WhatsApp NÃO configurado</span>}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Precisa de <b>token permanente</b> e <b>Phone Number ID</b> preenchidos pra ficar ativo.
          Sem isso, todo envio de mensagem falha silenciosamente (a operação principal — abrir OS,
          finalizar, cobrar — continua funcionando).
        </p>
      </div>

      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {ok   && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}

      <form onSubmit={salvar} className="space-y-5">
        {/* Grupo 1: Setup Meta */}
        <div className="card p-5">
          <h2 className="titulo-secao">Setup Meta Cloud API</h2>
          <p className="mb-4 text-xs text-slate-500">
            Do painel developers.facebook.com — quando trocar de token ou de número,
            atualize aqui. Deixe em branco pra manter o valor atual (não zera segredo por acidente).
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoSecreto label="Token permanente (WHATSAPP_TOKEN)" obrigatorio
              valorMascarado={dados.setup.token}
              valor={form.setup.token ?? ''}
              onChange={set('setup', 'token')}
              ajuda="Gerado no System User da Business Manager." />

            <Campo label="Phone Number ID" obrigatorio
              ajuda="ID do número remetente. Ex.: 123456789012345">
              <input className="input font-mono text-sm"
                value={v('setup', 'phone_number_id')}
                onChange={(e) => set('setup', 'phone_number_id')(e.target.value)}
                placeholder="123456789012345" />
            </Campo>

            <Campo label="WABA ID"
              ajuda="ID da conta WhatsApp Business.">
              <input className="input font-mono text-sm"
                value={v('setup', 'waba_id')}
                onChange={(e) => set('setup', 'waba_id')(e.target.value)}
                placeholder="123456789012345" />
            </Campo>

            <CampoSecreto label="Verify Token"
              valorMascarado={dados.setup.verify_token}
              valor={form.setup.verify_token ?? ''}
              onChange={set('setup', 'verify_token')}
              ajuda="Frase que VOCÊ inventa. A Meta manda pra você validar o webhook." />

            <Campo label="Versão da API">
              <input className="input" value={v('setup', 'api_version')}
                onChange={(e) => set('setup', 'api_version')(e.target.value)}
                placeholder="v21.0" />
            </Campo>

            <Campo label="Idioma padrão dos templates">
              <input className="input" value={v('setup', 'default_lang')}
                onChange={(e) => set('setup', 'default_lang')(e.target.value)}
                placeholder="pt_BR" />
            </Campo>
          </div>
        </div>

        {/* Grupo 2: Templates */}
        <div className="card p-5">
          <h2 className="titulo-secao">Nomes dos templates aprovados</h2>
          <p className="mb-4 text-xs text-slate-500">
            Cada notificação usa um template aprovado na Meta. Se você aprovou com nomes
            diferentes, coloque aqui. Deixe em branco pra usar os padrões.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['abertura',   'OS aberta',            'os_aberta'],
              ['finalizada', 'OS finalizada',        'os_finalizada'],
              ['paga',       'OS paga (recibo)',     'os_paga'],
              ['retorno',    'Retorno agendado',     'retorno_agendado'],
              ['lembrete',   'Lembrete agendamento', 'lembrete_agendamento'],
              ['alerta',     'Alerta de contas (interno)', 'alerta_contas'],
            ].map(([k, label, padrao]) => (
              <Campo key={k} label={label} ajuda={`Default: ${padrao}`}>
                <input className="input font-mono text-sm"
                  value={v('templates', k)}
                  onChange={(e) => set('templates', k)(e.target.value)}
                  placeholder={padrao} />
              </Campo>
            ))}
          </div>
        </div>

        {/* Grupo 3: Alertas internos */}
        <div className="card p-5">
          <h2 className="titulo-secao">Alertas internos (dono da oficina)</h2>
          <p className="mb-4 text-xs text-slate-500">
            Onde e quando você recebe os avisos de contas a pagar. Este número NÃO é o
            da oficina — é o SEU celular pessoal, se quiser separar. Deixe vazio pra
            deixar os alertas só na tela do sistema.
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

        {/* Grupo 4: Meta de faturamento */}
        <div className="card p-5">
          <h2 className="titulo-secao">Meta de faturamento mensal</h2>
          <p className="mb-4 text-xs text-slate-500">
            Aparece no Painel como barra de progresso com projeção do fechamento
            baseada no ritmo atual. Deixe vazio pra esconder o bloco.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Meta mensal (R$)"
              ajuda="Ex.: 20000 = R$ 20.000">
              <input type="number" min="0" step="100" className="input tnum"
                value={v('meta', 'mensal')}
                onChange={(e) => set('meta', 'mensal')(e.target.value)}
                placeholder="20000" />
            </Campo>
          </div>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button type="button" className="btn-ghost" onClick={carregar}>
            Descartar alterações
          </button>
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Salvar configurações'}
          </button>
        </div>
      </form>
    </div>
  );
}
