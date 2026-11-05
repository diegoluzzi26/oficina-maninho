import { useEffect, useState } from 'react';
import { FileKey, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { Alerta, Campo, Skeleton, Spinner } from './ui';

// Mesmos campos de CAMPOS em src/services/fiscal.service.js.
const CAMPOS = [
  'cnpj', 'razao_social', 'nome_fantasia', 'inscricao_municipal', 'inscricao_estadual',
  'regime_tributario', 'cnae', 'email',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'municipio', 'uf',
  'nfse_padrao', 'codigo_servico', 'codigo_tributacao_municipal', 'aliquota_iss', 'iss_retido',
  'serie_nfe', 'ncm_padrao', 'cfop_padrao', 'csosn_padrao', 'csosn_st', 'pis_cofins_cst',
];

const CSOSN = [
  ['102', '102 — Tributada sem permissão de crédito'],
  ['101', '101 — Tributada com permissão de crédito'],
  ['103', '103 — Isenção do ICMS para faixa de receita'],
  ['300', '300 — Imune'],
  ['400', '400 — Não tributada'],
  ['500', '500 — ICMS já cobrado por substituição tributária'],
  ['900', '900 — Outros'],
];

const REGIMES = [
  ['simples_nacional', 'Simples Nacional'],
  ['simples_excesso_sublimite', 'Simples Nacional (excesso de sublimite)'],
  ['regime_normal', 'Regime normal (Lucro Presumido/Real)'],
  ['mei', 'MEI'],
];

const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');

function formDe(cfg) {
  return Object.fromEntries(CAMPOS.map((c) => {
    const v = cfg[c];
    if (c === 'iss_retido') return [c, Boolean(v)];
    return [c, v === null || v === undefined ? '' : String(v)];
  }));
}

/** Corpo do PUT: '' vira null; números como número. */
function corpoDe(form) {
  const b = {};
  for (const c of CAMPOS) {
    const v = form[c];
    if (c === 'iss_retido') b[c] = Boolean(v);
    else if (c === 'aliquota_iss') b[c] = v === '' ? null : Number(String(v).replace(',', '.'));
    else if (c === 'serie_nfe') b[c] = v === '' ? 1 : Number(v);
    else if (c === 'nfse_padrao') b[c] = v || 'nacional';
    else b[c] = v === '' ? null : v;
  }
  return b;
}

// 140101 -> 14.01.01 (só exibição; o servidor guarda os dígitos).
const codigoServicoBR = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}` : v;
};

const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Situação no topo: o que falta pra emitir. */
function Situacao({ cfg }) {
  let icone; let titulo; let texto; let cor;
  if (cfg.pronta) {
    icone = <CheckCircle2 size={20} aria-hidden="true" />;
    cor = 'border-emerald-200 bg-emerald-50 text-emerald-800';
    titulo = cfg.ambiente === 'producao' ? 'Pronta para emitir notas' : 'Pronta para emitir notas de teste';
    texto = cfg.ambiente === 'producao'
      ? 'Notas emitidas agora têm validade fiscal.'
      : 'Em homologação, as notas são de teste e não têm validade fiscal.';
  } else {
    icone = <AlertTriangle size={20} aria-hidden="true" />;
    cor = 'border-ouro-300 bg-ouro-100 text-ouro-700';
    titulo = 'Ainda não dá para emitir';
    if (cfg.pendencias.length) texto = `Falta preencher: ${cfg.pendencias.map((p) => p.rotulo).join(', ')}.`;
    else if (!cfg.conectada) texto = 'Dados completos. Agora envie o certificado digital A1 para conectar.';
    else if (cfg.certificado_vencido) texto = 'O certificado digital venceu. Envie o certificado renovado.';
    else if (cfg.sem_codigo_municipio) {
      texto = 'O emissor não devolveu o código do município. Confira cidade e CEP e salve os dados de novo.';
    } else texto = 'Conexão incompleta. Envie o certificado de novo.';
  }
  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${cor}`}>
      <span className="mt-0.5 shrink-0">{icone}</span>
      <div className="text-sm">
        <p className="font-semibold">{titulo}</p>
        <p className="mt-0.5">{texto}</p>
        {cfg.conectada && (
          <p className="mt-1 text-xs opacity-80">
            Certificado válido até {dataBR(cfg.certificado_valido_ate)}
            {' · '}Ambiente: {cfg.ambiente === 'producao' ? 'produção' : 'homologação (teste)'}
          </p>
        )}
      </div>
    </div>
  );
}

/** Upload do certificado A1 + senha. Vai direto pra Focus; nada fica salvo aqui. */
function Certificado({ cfg, onConectado }) {
  const [arquivo, setArquivo] = useState(null);
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const bloqueio = !cfg.focus_configurada
    ? 'A emissão de nota ainda não foi liberada na plataforma. Fale com o suporte.'
    : cfg.pendencias.length ? 'Preencha e salve os dados obrigatórios antes de enviar o certificado.' : '';

  async function enviar(e) {
    e.preventDefault();
    setErro(''); setEnviando(true);
    try {
      const r = await api.enviarCertificadoFiscal(arquivo, senha);
      setArquivo(null); setSenha('');
      e.target.reset();
      onConectado(r);
    } catch (err) { setErro(err.message); }
    finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} className="card p-5">
      <h2 className="titulo-secao">Certificado digital A1</h2>
      <p className="mb-4 text-xs text-slate-500">
        Arquivo .pfx ou .p12 do CNPJ da oficina. Ele e a senha vão direto para o emissor
        (Focus NFe) e não ficam guardados no sistema.
        {cfg.conectada && ' Para renovar, envie o certificado novo aqui.'}
      </p>
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {bloqueio && <p className="mb-3 text-sm text-ouro-700">{bloqueio}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Arquivo do certificado" obrigatorio>
          <input type="file" accept=".pfx,.p12" className="input py-1.5" disabled={!!bloqueio}
            onChange={(e) => setArquivo(e.target.files?.[0] || null)} required />
        </Campo>
        <Campo label="Senha do certificado" obrigatorio>
          <input type="password" className="input" autoComplete="off" disabled={!!bloqueio}
            value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </Campo>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" className="btn-primary" disabled={!!bloqueio || enviando || !arquivo || !senha}>
          {enviando
            ? <><Spinner className="h-4 w-4" /> Conectando…</>
            : <><FileKey size={16} aria-hidden="true" /> {cfg.conectada ? 'Enviar certificado novo' : 'Enviar e conectar'}</>}
        </button>
      </div>
    </form>
  );
}

/**
 * NFS-e pelo sistema da prefeitura (ex.: Gravataí): a Focus entra com o
 * login e a senha do site da prefeitura. A senha vai direto pra Focus.
 */
function AcessoPrefeitura({ cfg, onSalvo }) {
  const [login, setLogin] = useState(cfg.prefeitura_login || '');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setSalvando(true);
    try { onSalvo(await api.salvarPrefeitura(login.trim(), senha)); setSenha(''); }
    catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <form onSubmit={salvar} className="card p-5">
      <h2 className="titulo-secao">Acesso ao site da prefeitura (NFS-e)</h2>
      <div className="mb-4 space-y-1 text-xs text-slate-600">
        <p>
          A NFS-e sai pelo sistema da prefeitura usando o CNPJ da oficina e a mesma senha do site dela.
          A senha vai direto para o emissor (Focus NFe) e não fica guardada aqui.
        </p>
        <p className="font-semibold text-ouro-700">
          Esse sistema não tem ambiente de teste: toda NFS-e emitida vale de verdade.
        </p>
        <p>
          Antes, libere o acesso no <b>Portal do Cidadão / Autoatendimento</b> da prefeitura (não no sistema da
          NFS-e): serviço <b>Emissão de NFS-e por WebService</b> → <b>Liberar Acesso ao Usuário</b>.
        </p>
      </div>
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {cfg.prefeitura_configurada && (
        <p className="mb-3 text-sm text-emerald-700">Acesso enviado (login {cfg.prefeitura_login}). Para trocar, informe de novo.</p>
      )}
      {!cfg.conectada && <p className="mb-3 text-sm text-ouro-700">Envie o certificado digital primeiro.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Login da prefeitura" obrigatorio ajuda="O CNPJ da oficina (só números)">
          <input className="input font-mono" value={login} autoComplete="off" placeholder={cfg.cnpj || 'CNPJ'}
            onChange={(e) => setLogin(e.target.value)}
            disabled={!cfg.conectada} required maxLength={100} />
        </Campo>
        <Campo label="Senha da prefeitura" obrigatorio>
          <input type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)}
            autoComplete="off" disabled={!cfg.conectada} required maxLength={200} />
        </Campo>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" className="btn-primary" disabled={!cfg.conectada || salvando || !login.trim() || !senha}>
          {salvando ? <><Spinner className="h-4 w-4" /> Enviando…</> : 'Salvar acesso da prefeitura'}
        </button>
      </div>
    </form>
  );
}

/** Homologação (teste) ↔ produção (validade fiscal). */
function Ambiente({ cfg, onSalvo, onErro }) {
  const [salvando, setSalvando] = useState(false);
  const producao = cfg.ambiente === 'producao';

  async function trocar() {
    const novo = producao ? 'homologacao' : 'producao';
    const msg = novo === 'producao'
      ? 'Passar para PRODUÇÃO? A partir daí as notas emitidas têm validade fiscal.'
      : 'Voltar para homologação? As próximas notas serão só de teste.';
    if (!window.confirm(msg)) return;
    setSalvando(true);
    try { onSalvo(await api.salvarFiscalConfig({ ambiente: novo })); }
    catch (err) { onErro(err.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <h2 className="titulo-secao">Ambiente de emissão</h2>
        <p className="text-sm text-slate-600">
          {producao
            ? 'Produção: as notas têm validade fiscal.'
            : 'Homologação: notas de teste, sem validade fiscal. Teste aqui antes de ir para produção.'}
        </p>
      </div>
      <button type="button" className={producao ? 'btn-ghost' : 'btn-primary'}
        disabled={salvando || (!producao && !cfg.pronta)} onClick={trocar}
        title={!producao && !cfg.pronta ? 'Conecte e teste em homologação primeiro' : undefined}>
        {salvando ? <Spinner className="h-4 w-4" /> : null}
        {producao ? 'Voltar para homologação' : 'Passar para produção'}
      </button>
    </div>
  );
}

/**
 * Aba Fiscal das Configurações: dados do emitente, parâmetros das notas,
 * certificado A1 e ambiente. Disponível com o adicional Nota fiscal.
 */
export default function ConfigFiscal() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState(null);
  const [semAdicional, setSemAdicional] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  function aplicar(c) { setCfg(c); setForm(formDe(c)); }

  useEffect(() => {
    api.fiscalConfig()
      .then(aplicar)
      .catch((e) => {
        if (e.status === 403 && e.detalhes?.adicional) setSemAdicional(true);
        else setErro(e.message);
      });
  }, []);

  const set = (campo) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [campo]: v }));
  };

  async function salvar(e) {
    e.preventDefault();
    setErro(''); setOk(''); setSalvando(true);
    try {
      aplicar(await api.salvarFiscalConfig(corpoDe(form)));
      setOk('Dados fiscais salvos.');
    } catch (err) { setErro(err.message); }
    finally { setSalvando(false); }
  }

  if (semAdicional) {
    return (
      <div className="card p-6">
        <h2 className="titulo-secao">Nota fiscal</h2>
        <p className="text-sm text-slate-600">
          Emita NFS-e (mão de obra) e NF-e (peças) direto da ordem de serviço. É um adicional
          de R$ 39/mês, disponível nos planos Profissional e Completo. Para contratar, fale com o suporte.
        </p>
      </div>
    );
  }

  if (!cfg) {
    return erro
      ? <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>
      : <Skeleton className="h-[600px]" />;
  }

  const obrig = new Set(cfg.pendencias.map((p) => p.campo));
  const marcar = (c) => (obrig.has(c) ? 'border-ouro-400' : '');

  return (
    <div className="space-y-5">
      <Situacao cfg={cfg} />
      {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}
      {ok && <Alerta tipo="ok" onFechar={() => setOk('')}>{ok}</Alerta>}

      <form onSubmit={salvar} className="space-y-5">
        <section className="card p-5">
          <h2 className="titulo-secao">Emitente</h2>
          <p className="mb-4 text-xs text-slate-500">
            Como a oficina aparece na nota. Regime, inscrições e códigos: confirme com o contador.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo label="CNPJ" obrigatorio>
              <input className={`input font-mono ${marcar('cnpj')}`} value={form.cnpj} onChange={set('cnpj')}
                placeholder="00.000.000/0000-00" maxLength={18} />
            </Campo>
            <Campo label="Razão social" obrigatorio>
              <input className={`input ${marcar('razao_social')}`} value={form.razao_social}
                onChange={set('razao_social')} maxLength={150} />
            </Campo>
            <Campo label="Nome fantasia">
              <input className="input" value={form.nome_fantasia} onChange={set('nome_fantasia')} maxLength={150} />
            </Campo>
            <Campo label="Regime tributário" obrigatorio>
              <select className={`input ${marcar('regime_tributario')}`} value={form.regime_tributario}
                onChange={set('regime_tributario')}>
                <option value="">Selecione…</option>
                {REGIMES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="Inscrição municipal" obrigatorio>
              <input className={`input ${marcar('inscricao_municipal')}`} value={form.inscricao_municipal}
                onChange={set('inscricao_municipal')} maxLength={30} />
            </Campo>
            <Campo label="Inscrição estadual" obrigatorio ajuda="Ou escreva ISENTO">
              <input className={`input ${marcar('inscricao_estadual')}`} value={form.inscricao_estadual}
                onChange={set('inscricao_estadual')} maxLength={30} />
            </Campo>
            <Campo label="CNAE principal" ajuda="7 dígitos, ex. 4520001">
              <input className="input font-mono" value={form.cnae} onChange={set('cnae')} maxLength={9} />
            </Campo>
            <Campo label="E-mail fiscal" obrigatorio ajuda="Recebe avisos do emissor">
              <input type="email" className={`input ${marcar('email')}`} value={form.email}
                onChange={set('email')} maxLength={150} />
            </Campo>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="titulo-secao">Endereço fiscal</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo label="CEP" obrigatorio>
              <input className={`input font-mono ${marcar('cep')}`} value={form.cep} onChange={set('cep')}
                placeholder="00000-000" maxLength={9} />
            </Campo>
            <div className="sm:col-span-2 lg:col-span-2">
              <Campo label="Logradouro" obrigatorio>
                <input className={`input ${marcar('logradouro')}`} value={form.logradouro}
                  onChange={set('logradouro')} maxLength={150} />
              </Campo>
            </div>
            <Campo label="Número" obrigatorio>
              <input className={`input ${marcar('numero')}`} value={form.numero} onChange={set('numero')}
                placeholder="ou SN" maxLength={60} />
            </Campo>
            <Campo label="Complemento">
              <input className="input" value={form.complemento} onChange={set('complemento')} maxLength={60} />
            </Campo>
            <Campo label="Bairro" obrigatorio>
              <input className={`input ${marcar('bairro')}`} value={form.bairro} onChange={set('bairro')} maxLength={80} />
            </Campo>
            <Campo label="Município" obrigatorio>
              <input className={`input ${marcar('municipio')}`} value={form.municipio}
                onChange={set('municipio')} maxLength={80} />
            </Campo>
            <Campo label="UF" obrigatorio>
              <select className={`input ${marcar('uf')}`} value={form.uf} onChange={set('uf')}>
                <option value="">—</option>
                {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Campo>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="titulo-secao">NFS-e (mão de obra)</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo label="Padrão da NFS-e" ajuda="Nacional é o padrão desde 2026; municipal só se a prefeitura exigir">
              <select className="input" value={form.nfse_padrao} onChange={set('nfse_padrao')}>
                <option value="nacional">Nacional</option>
                <option value="municipal">Sistema da prefeitura (ex.: Gravataí)</option>
              </select>
            </Campo>
            <Campo label="Código de tributação do serviço" obrigatorio
              ajuda="Código nacional com 6 dígitos (LC 116). Conserto de veículos costuma ser 14.01.01">
              <input className={`input font-mono ${marcar('codigo_servico')}`}
                value={codigoServicoBR(form.codigo_servico)}
                onChange={set('codigo_servico')} placeholder="14.01.01" maxLength={8} />
            </Campo>
            <Campo label="Código de tributação municipal" ajuda="Se a prefeitura usar">
              <input className="input font-mono" value={form.codigo_tributacao_municipal}
                onChange={set('codigo_tributacao_municipal')} maxLength={30} />
            </Campo>
            <Campo label="Alíquota de ISS (%)" obrigatorio ajuda="Entre 2% e 5%, depende do município">
              <input className={`input ${marcar('aliquota_iss')}`} inputMode="decimal" value={form.aliquota_iss}
                onChange={set('aliquota_iss')} placeholder="3,00" maxLength={5} />
            </Campo>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.iss_retido} onChange={set('iss_retido')} />
              ISS retido pelo tomador
            </label>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="titulo-secao">NF-e (peças)</h2>
          <p className="mb-4 text-xs text-slate-500">
            O NCM vem de cada peça do catálogo. Aqui ficam a série e a tributação padrão: confirme com o contador.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Série da NF-e">
              <input className="input" inputMode="numeric" value={form.serie_nfe} onChange={set('serie_nfe')} maxLength={3} />
            </Campo>
            <Campo label="CFOP padrão" ajuda="Peça sem CFOP próprio. Ex. 5102, ou 5405 com ST">
              <input className="input font-mono" value={form.cfop_padrao} onChange={set('cfop_padrao')} maxLength={4} />
            </Campo>
            <Campo label="CST de PIS/COFINS" ajuda="Simples Nacional costuma usar 49">
              <input className="input font-mono" value={form.pis_cofins_cst} onChange={set('pis_cofins_cst')} maxLength={2} />
            </Campo>
            <Campo label="CSOSN (peça sem ST)">
              <select className="input" value={form.csosn_padrao} onChange={set('csosn_padrao')}>
                {CSOSN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo label="CSOSN (peça com ST)" ajuda="Usado nas peças com CEST no catálogo">
              <select className="input" value={form.csosn_st} onChange={set('csosn_st')}>
                {CSOSN.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
          </div>
        </section>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={salvando}>
            {salvando ? <><Spinner className="h-4 w-4" /> Salvando…</> : 'Salvar dados fiscais'}
          </button>
        </div>
      </form>

      <Certificado cfg={cfg} onConectado={(c) => { aplicar(c); setOk('Oficina conectada ao emissor.'); }} />
      {cfg.nfse_municipal && (
        <AcessoPrefeitura cfg={cfg} onSalvo={(c) => { aplicar(c); setOk('Acesso da prefeitura enviado ao emissor.'); }} />
      )}
      {cfg.conectada && <Ambiente cfg={cfg} onSalvo={aplicar} onErro={setErro} />}
    </div>
  );
}
