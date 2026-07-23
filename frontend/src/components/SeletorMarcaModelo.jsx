import { useId } from 'react';
import { Campo } from './ui';
import { MARCAS, modelosDe } from '../lib/marcas-carros';

/**
 * Dois campos (Marca + Modelo) que se comportam como select mas aceitam
 * valor livre — implementado com `<input list>` + `<datalist>`, sem
 * dependência externa.
 *
 * A marca lista as 30+ marcas comuns no Brasil (VW, Chevrolet, Fiat, …).
 * Ao mudar a marca, os modelos daquela marca aparecem no autocomplete
 * do campo Modelo. Se o cliente tem um carro fora da lista, o atendente
 * digita direto — nada é bloqueado.
 *
 * Props:
 *   marca, modelo    — valores atuais (strings)
 *   onChange({marca, modelo})  — callback com os dois campos juntos
 *   obrigatorio      — marca ambos como obrigatórios visualmente
 *   layout           — 'colunas' (default, cada um Campo separado, o
 *                     container decide o grid) ou 'inline' (renderiza
 *                     dentro de uma div sem afetar layout externo)
 */
export function SeletorMarcaModelo({ marca = '', modelo = '', onChange, obrigatorio = false }) {
  // useId garante ID único por instância — evita colisão quando dois
  // seletores renderizam na mesma página (ex: modal + tabela).
  const uid = useId();
  const idMarcas  = `marcas-${uid}`;
  const idModelos = `modelos-${uid}`;
  const opcoes = modelosDe(marca);

  return (
    <>
      <Campo label="Marca" obrigatorio={obrigatorio}
        ajuda="Escolha da lista ou digite se não estiver">
        <input list={idMarcas} className="input" value={marca} required={obrigatorio}
          placeholder="Volkswagen, Chevrolet, Fiat…"
          onChange={(e) => onChange({ marca: e.target.value, modelo })} />
        <datalist id={idMarcas}>
          {MARCAS.map((m) => <option key={m.nome} value={m.nome} />)}
        </datalist>
      </Campo>

      <Campo label="Modelo" obrigatorio={obrigatorio}
        ajuda={marca ? `${opcoes.length} modelos comuns; pode digitar outro` : 'Escolha a marca primeiro'}>
        <input list={idModelos} className="input" value={modelo} required={obrigatorio}
          placeholder={marca ? 'Gol, Onix, Uno…' : '—'}
          onChange={(e) => onChange({ marca, modelo: e.target.value })} />
        <datalist id={idModelos}>
          {opcoes.map((m) => <option key={m} value={m} />)}
        </datalist>
      </Campo>
    </>
  );
}
