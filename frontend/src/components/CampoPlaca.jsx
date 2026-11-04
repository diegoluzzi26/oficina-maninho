import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Campo, Spinner } from './ui';

const PLACA_OK = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;
const limpa = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// O status (token configurado ou não) é da plataforma toda: pergunta uma vez só.
let statusPromise = null;
const consultaAtiva = () => {
  statusPromise ??= api.statusPlaca().then((r) => !!r.ativo).catch(() => false);
  return statusPromise;
};

/**
 * Campo de placa que consulta o veículo (API Placas) e devolve os dados pra
 * o formulário preencher marca, modelo, ano, cor e chassi.
 *
 * Props:
 *   valor, onChange(placa)  — placa digitada
 *   onDados(dados)          — { marca, modelo, ano, cor, chassi } vindos da consulta
 *   auto                    — consulta sozinho quando a placa fica completa
 *                             (cadastro novo); na edição fica só o botão
 *   obrigatorio
 */
export function CampoPlaca({ valor, onChange, onDados, auto = true, obrigatorio = false }) {
  const [ativa, setAtiva] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState(null); // { tipo: 'ok' | 'erro', texto }
  const ultima = useRef('');

  useEffect(() => { consultaAtiva().then(setAtiva); }, []);

  async function buscar(placa = limpa(valor)) {
    if (!PLACA_OK.test(placa) || buscando) return;
    ultima.current = placa;
    setBuscando(true); setMsg(null);
    try {
      const d = await api.consultarPlaca(placa);
      onDados(d);
      const resumo = [d.marca, d.modelo].filter(Boolean).join(' ')
        + (d.ano ? ` · ${d.ano}` : '') + (d.cor ? ` · ${d.cor}` : '');
      setMsg({ tipo: 'ok', texto: `${resumo}. Confira antes de salvar.` });
    } catch (e) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setBuscando(false);
    }
  }

  useEffect(() => {
    const p = limpa(valor);
    if (!PLACA_OK.test(p)) { setMsg(null); return; }
    if (ativa && auto && p !== ultima.current) buscar(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, ativa, auto]);

  const placaValida = PLACA_OK.test(limpa(valor));

  return (
    <Campo label="Placa" obrigatorio={obrigatorio}>
      <div className="flex gap-2">
        <input className="input font-mono uppercase" value={valor} required={obrigatorio}
          placeholder="ABC1D23" maxLength={8}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter' && ativa) { e.preventDefault(); buscar(); } }} />
        {ativa && (
          <button type="button" className="btn-ghost shrink-0 px-3 text-xs"
            disabled={!placaValida || buscando} onClick={() => buscar()}
            title="Puxar marca, modelo, ano e cor pela placa">
            {buscando ? <Spinner className="h-4 w-4" /> : 'Buscar'}
          </button>
        )}
      </div>
      {msg && (
        <p className={`mt-1 text-xs ${msg.tipo === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
          {msg.texto}
        </p>
      )}
    </Campo>
  );
}

/** Junta os dados da consulta no form sem apagar o que a consulta não trouxe. */
export function mesclarDadosPlaca(form, d) {
  const novo = { ...form };
  for (const k of ['marca', 'modelo', 'cor', 'chassi']) if (d[k]) novo[k] = d[k];
  if (d.ano) novo.ano = String(d.ano);
  return novo;
}
