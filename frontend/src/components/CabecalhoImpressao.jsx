import { useIdentidadeOficina } from '../lib/oficina';

/**
 * Cabeçalho das telas "papel" (OS e checklist): logo e nome da oficina
 * logada, com a cor secundária no fio de baixo. Sem logo, o nome vai em
 * destaque na cor principal. Endereço, telefone e especialidades vêm do
 * cadastro da oficina; linha sem dado não aparece.
 */
export default function CabecalhoImpressao() {
  const oficina = useIdentidadeOficina();
  // "RS-020, 1055 · Gravataí/RS" — junta só as partes preenchidas.
  const cidadeUf = [oficina?.cidade, oficina?.uf].filter(Boolean).join('/');
  const endereco = [oficina?.endereco, cidadeUf].filter(Boolean).join(' · ');
  return (
    <header className="mb-6 flex items-center justify-between gap-6 border-b-2 pb-4"
      style={{ borderColor: oficina?.cor_secundaria ? oficina.secundaria : '#cbd5e1' }}>
      {oficina?.logo_url
        ? <img src={oficina.logo_url} alt={oficina.nome} className="h-14 w-auto max-w-[220px] object-contain" />
        : <p className="font-display text-xl font-extrabold"
            style={{ color: oficina?.cor_primaria ? oficina.primaria : '#1e293b' }}>
            {oficina?.nome}
          </p>}
      <div className="text-right text-xs leading-snug text-slate-600">
        {oficina?.logo_url && (
          <p className="font-display text-[13px] font-semibold uppercase tracking-wide text-slate-800">
            {oficina.nome}
          </p>
        )}
        {endereco && <p>{endereco}</p>}
        {oficina?.telefone && <p>{oficina.telefone}</p>}
        {oficina?.especialidades && <p>{oficina.especialidades}</p>}
      </div>
    </header>
  );
}
