import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarCheck, Check, MapPin, Phone } from 'lucide-react';
import { api } from '../lib/api';
import { normalizarIdentidade } from '../lib/oficina';
import { Alerta, Campo, Spinner } from '../components/ui';

/**
 * Página pública de agendamento: o cliente final marca horário sozinho.
 * Link curto gestaotorque.com.br/agendar/<slug> (nginx manda pra
 * /app/#/agendar/<slug>); a oficina coloca no Perfil da Empresa no Google.
 * Pensada pro celular: quem chega aqui veio do Maps ou da Busca.
 */

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'];
const VAZIO = { nome: '', telefone: '', placa: '', marca: '', modelo: '', observacoes: '', site: '' };

function mascaraFone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function dow(iso) { return new Date(`${iso}T12:00:00Z`).getUTCDay(); }
function proxDia(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function ddmm(iso) { const [, m, d] = iso.split('-'); return `${d}/${m}`; }

export default function AgendarOnline() {
  const { slug } = useParams();
  const [info, setInfo] = useState(null);
  const [erroCarga, setErroCarga] = useState('');
  const [data, setData] = useState('');
  const [horarios, setHorarios] = useState(null);
  const [hora, setHora] = useState('');
  const [servicos, setServicos] = useState([]);
  const [f, setF] = useState(VAZIO);
  const [erro, setErro] = useState('');
  const [errosCampo, setErrosCampo] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(null);

  useEffect(() => {
    api.agendaPublica(slug)
      .then((d) => { setInfo(d); document.title = `Agendar · ${d.oficina.nome}`; })
      .catch((e) => setErroCarga(e.message));
  }, [slug]);

  const dias = useMemo(() => {
    if (!info) return [];
    const out = [];
    for (let d = info.agenda.primeiro_dia; d <= info.agenda.ultimo_dia; d = proxDia(d)) {
      if (info.agenda.dias.includes(dow(d))) out.push(d);
    }
    return out;
  }, [info]);

  useEffect(() => {
    if (!data) return;
    setHorarios(null); setHora('');
    api.agendaPublicaHorarios(slug, data)
      .then((r) => setHorarios(r.horarios))
      .catch((e) => { setHorarios([]); setErro(e.message); });
  }, [slug, data]);

  const set = (campo) => (e) => {
    let v = e.target.value;
    if (campo === 'telefone') v = mascaraFone(v);
    if (campo === 'placa') v = v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
    setF((x) => ({ ...x, [campo]: v }));
    setErrosCampo((x) => ({ ...x, [campo]: undefined }));
  };

  function alternaServico(id) {
    setServicos((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-5)));
  }

  async function enviar(e) {
    e.preventDefault();
    if (!data || !hora) { setErro('Escolha o dia e o horário.'); return; }
    setErro(''); setErrosCampo({}); setEnviando(true);
    try {
      await api.agendaPublicaAgendar(slug, {
        ...f, data, hora,
        observacoes: f.observacoes || undefined,
        servico_ids: servicos.length ? servicos : undefined,
      });
      setFeito({ data, hora });
    } catch (err) {
      if (err.detalhes?.length) {
        setErrosCampo(Object.fromEntries(err.detalhes.map((d) => [d.campo, d.erro])));
        setErro('Confira os campos destacados.');
      } else {
        setErro(err.message);
        // Horário tomado por outra pessoa: recarrega a lista do dia.
        if (err.status === 409) {
          setHora('');
          api.agendaPublicaHorarios(slug, data).then((r) => setHorarios(r.horarios)).catch(() => {});
        }
      }
    } finally {
      setEnviando(false);
    }
  }

  if (erroCarga) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <div className="max-w-sm text-center">
          <CalendarCheck className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 font-semibold text-slate-700">{erroCarga}</p>
          <p className="mt-1 text-sm text-slate-500">Entre em contato direto com a oficina pra marcar.</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return <div className="flex min-h-screen items-center justify-center"><Spinner className="h-7 w-7" /></div>;
  }

  const of = normalizarIdentidade(info.oficina);
  const endereco = [of.endereco, [of.cidade, of.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
  const corBotao = { backgroundColor: of.primaria };

  const cabecalho = (
    <header className="px-5 pb-6 pt-8 text-white" style={{ backgroundColor: of.primaria }}>
      <div className="mx-auto flex max-w-lg items-center gap-3">
        {of.logo_url && (
          <img src={of.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain p-1" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Agendar horário</p>
          <h1 className="truncate text-xl font-bold">{of.nome}</h1>
          {endereco && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-white/80"><MapPin size={12} /> {endereco}</p>
          )}
        </div>
      </div>
    </header>
  );

  if (feito) {
    return (
      <div className="min-h-screen bg-slate-50">
        {cabecalho}
        <main className="mx-auto max-w-lg px-5 py-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <Check className="text-emerald-600" size={30} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-800">Horário marcado!</h2>
          <p className="mt-2 text-slate-600">
            Te esperamos na <b>{DIAS_LONGOS[dow(feito.data)]}, {ddmm(feito.data)}</b> às <b>{feito.hora}</b>.
          </p>
          {of.telefone && (
            <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-slate-500">
              <Phone size={14} /> Precisa remarcar? Fale com a oficina: {of.telefone}
            </p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {cabecalho}

      <form onSubmit={enviar} className="mx-auto max-w-lg space-y-6 px-5 pt-6">
        {info.agenda.mensagem && (
          <p className="rounded-lg bg-white p-3 text-sm text-slate-600 shadow-sm">{info.agenda.mensagem}</p>
        )}

        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-800">1. Escolha o dia</h2>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {dias.map((d) => {
              const ativo = d === data;
              return (
                <button key={d} type="button" onClick={() => setData(d)} aria-pressed={ativo}
                  className={`flex w-16 shrink-0 flex-col items-center rounded-lg border py-2 transition
                    ${ativo ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                  style={ativo ? corBotao : undefined}>
                  <span className="text-[11px] font-semibold uppercase">{DIAS[dow(d)]}</span>
                  <span className="text-base font-bold">{ddmm(d)}</span>
                </button>
              );
            })}
          </div>
        </section>

        {data && (
          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-800">2. Escolha o horário</h2>
            {horarios === null ? (
              <Spinner />
            ) : horarios.length === 0 ? (
              <p className="text-sm text-slate-500">Sem horários livres neste dia. Tente outro dia.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {horarios.map((h) => (
                  <button key={h} type="button" onClick={() => setHora(h)} aria-pressed={h === hora}
                    className={`rounded-lg border py-2 text-sm font-semibold transition
                      ${h === hora ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-700'}`}
                    style={h === hora ? corBotao : undefined}>
                    {h}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {hora && (
          <section className="space-y-3.5">
            <h2 className="text-sm font-bold text-slate-800">3. Seus dados</h2>
            <Campo label="Seu nome" obrigatorio erro={errosCampo.nome}>
              <input className="input" value={f.nome} onChange={set('nome')} required autoComplete="name" />
            </Campo>
            <Campo label="WhatsApp" obrigatorio erro={errosCampo.telefone}
              ajuda="A confirmação chega por aqui.">
              <input className="input" type="tel" inputMode="numeric" value={f.telefone}
                onChange={set('telefone')} required autoComplete="tel" placeholder="(51) 99999-9999" />
            </Campo>
            <Campo label="Placa" obrigatorio erro={errosCampo.placa}>
              <input className="input font-mono uppercase" value={f.placa} onChange={set('placa')}
                required placeholder="ABC1D23" autoCapitalize="characters" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Marca" obrigatorio erro={errosCampo.marca}>
                <input className="input" value={f.marca} onChange={set('marca')} required placeholder="Fiat" />
              </Campo>
              <Campo label="Modelo" obrigatorio erro={errosCampo.modelo}>
                <input className="input" value={f.modelo} onChange={set('modelo')} required placeholder="Uno" />
              </Campo>
            </div>

            {info.servicos.length > 0 && (
              <div>
                <span className="label mb-1.5 block">O que precisa? (opcional)</span>
                <div className="flex flex-wrap gap-2">
                  {info.servicos.map((s) => {
                    const ativo = servicos.includes(s.id);
                    return (
                      <button key={s.id} type="button" onClick={() => alternaServico(s.id)} aria-pressed={ativo}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition
                          ${ativo ? 'border-transparent text-white' : 'border-slate-200 bg-white text-slate-600'}`}
                        style={ativo ? corBotao : undefined}>
                        {s.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Campo label="Conte o problema (opcional)" erro={errosCampo.observacoes}>
              <textarea className="input min-h-[80px]" value={f.observacoes} onChange={set('observacoes')}
                maxLength={500} placeholder="Ex.: luz da injeção acesa, barulho ao frear…" />
            </Campo>

            {/* Campo-armadilha: escondido, só robô preenche. */}
            <input type="text" name="site" value={f.site} onChange={set('site')} tabIndex={-1}
              autoComplete="off" className="hidden" aria-hidden="true" />
          </section>
        )}

        {erro && <Alerta tipo="erro" onFechar={() => setErro('')}>{erro}</Alerta>}

        {hora && (
          <button type="submit" disabled={enviando} style={corBotao}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-3 font-bold text-white
                       shadow-sm transition hover:opacity-90 disabled:opacity-60">
            {enviando ? <Spinner className="h-5 w-5" /> : <CalendarCheck size={18} />}
            Confirmar {DIAS[dow(data)].toLowerCase()}, {ddmm(data)} às {hora}
          </button>
        )}

        <p className="pt-4 text-center text-[11px] text-slate-400">Agendamento por Gestão Torque</p>
      </form>
    </div>
  );
}
