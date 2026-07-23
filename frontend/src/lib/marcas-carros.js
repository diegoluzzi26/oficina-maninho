/**
 * Marcas e modelos de carros mais comuns no Brasil.
 *
 * A lista NÃO precisa ser exaustiva — o componente `SeletorMarcaModelo`
 * usa `<input list>` (datalist) que aceita valor livre. Se o cliente
 * chega com um Renault Clio antigo ou uma marca chinesa nova que ainda
 * não está aqui, o atendente digita normalmente.
 *
 * Ordenação:
 *   1. Marcas mais frequentes primeiro (top-10 do BR)
 *   2. Resto em ordem alfabética
 *
 * Modelos: os principais/mais vendidos de cada marca — combinando
 * atuais e clássicos ainda comuns na frota (Corsa, Palio, Uno, etc.).
 */

export const MARCAS = [
  // ---- Top-10 mais vendidas no Brasil ----
  {
    nome: 'Volkswagen',
    modelos: ['Gol', 'Voyage', 'Polo', 'Virtus', 'T-Cross', 'Nivus', 'Tera',
      'Saveiro', 'Amarok', 'Taos', 'Jetta', 'Tiguan', 'Up!', 'Fox', 'Spacefox',
      'Crossfox', 'Golf', 'Fusca', 'Kombi', 'Passat', 'Bora'],
  },
  {
    nome: 'Chevrolet',
    modelos: ['Onix', 'Onix Plus', 'Tracker', 'Spin', 'S10', 'Montana',
      'Prisma', 'Cobalt', 'Cruze', 'Celta', 'Corsa', 'Classic', 'Astra',
      'Vectra', 'Meriva', 'Zafira', 'Agile', 'Sonic', 'Trailblazer',
      'Equinox', 'Blazer', 'Camaro'],
  },
  {
    nome: 'Fiat',
    modelos: ['Mobi', 'Argo', 'Cronos', 'Pulse', 'Fastback', 'Strada',
      'Toro', 'Fiorino', 'Ducato', 'Uno', 'Palio', 'Siena', 'Punto',
      'Idea', 'Doblò', 'Bravo', 'Linea', '500', 'Fiat 500', 'Grand Siena',
      'Weekend', 'Marea'],
  },
  {
    nome: 'Ford',
    modelos: ['Ka', 'Ka+', 'Fiesta', 'EcoSport', 'Focus', 'Fusion',
      'Ranger', 'Territory', 'Bronco', 'Bronco Sport', 'Maverick', 'Edge',
      'Escape', 'F-150', 'F-250', 'Courier', 'Belina', 'Escort', 'Del Rey'],
  },
  {
    nome: 'Toyota',
    modelos: ['Corolla', 'Corolla Cross', 'Yaris', 'Etios', 'Hilux',
      'SW4', 'RAV4', 'Camry', 'Prius', 'Bandeirante'],
  },
  {
    nome: 'Honda',
    modelos: ['Civic', 'City', 'Fit', 'HR-V', 'WR-V', 'CR-V', 'Accord',
      'Prelude', 'ZR-V'],
  },
  {
    nome: 'Hyundai',
    modelos: ['HB20', 'HB20S', 'HB20X', 'Creta', 'Tucson', 'Santa Fe',
      'ix35', 'i30', 'Azera', 'Elantra', 'Veloster', 'Vera Cruz'],
  },
  {
    nome: 'Renault',
    modelos: ['Kwid', 'Sandero', 'Sandero Stepway', 'Logan', 'Duster',
      'Oroch', 'Captur', 'Kardian', 'Kangoo', 'Master', 'Clio', 'Symbol',
      'Fluence', 'Megane', 'Scenic'],
  },
  {
    nome: 'Nissan',
    modelos: ['Kicks', 'Versa', 'March', 'Sentra', 'Frontier', 'Livina',
      'Tiida', 'Grand Livina', 'Altima'],
  },
  {
    nome: 'Jeep',
    modelos: ['Renegade', 'Compass', 'Commander', 'Wrangler', 'Cherokee',
      'Grand Cherokee', 'Gladiator'],
  },

  // ---- Alfabético ----
  { nome: 'Audi', modelos: ['A3', 'A4', 'A5', 'A6', 'Q3', 'Q5', 'Q7', 'Q8'] },
  { nome: 'BMW', modelos: ['Série 1', 'Série 2', 'Série 3', 'Série 5', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'i3'] },
  { nome: 'BYD', modelos: ['Dolphin', 'Song Plus', 'Yuan Plus', 'Han', 'King', 'Seal'] },
  { nome: 'Caoa Chery', modelos: ['Tiggo 2', 'Tiggo 3X', 'Tiggo 5X', 'Tiggo 7', 'Tiggo 8', 'Arrizo 5', 'Arrizo 6'] },
  { nome: 'Citroën', modelos: ['C3', 'C4', 'C4 Cactus', 'Aircross', 'Berlingo', 'C4 Lounge', 'Xsara'] },
  { nome: 'Dodge', modelos: ['Journey', 'Ram', 'Dakota', 'RAM 1500', 'Charger', 'Challenger'] },
  { nome: 'GWM', modelos: ['Haval H6', 'Ora 03', 'Poer'] },
  { nome: 'JAC', modelos: ['T40', 'T50', 'T60', 'iEV20', 'iEV40', 'E-JS1'] },
  { nome: 'Jaguar', modelos: ['F-Pace', 'E-Pace', 'XE', 'XF'] },
  { nome: 'Kia', modelos: ['Picanto', 'Cerato', 'Sportage', 'Sorento', 'Bongo', 'Soul', 'Stonic', 'K3', 'Cadenza'] },
  { nome: 'Land Rover', modelos: ['Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Defender', 'Freelander'] },
  { nome: 'Mercedes-Benz', modelos: ['Classe A', 'Classe B', 'Classe C', 'Classe E', 'Classe S', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'Sprinter', 'Vito'] },
  { nome: 'Mini', modelos: ['Cooper', 'Cooper S', 'Countryman', 'Clubman'] },
  { nome: 'Mitsubishi', modelos: ['L200', 'Pajero', 'Pajero Sport', 'Pajero TR4', 'ASX', 'Outlander', 'Eclipse Cross', 'Lancer'] },
  { nome: 'Peugeot', modelos: ['208', '2008', '3008', '5008', '206', '207', '307', '308', '408', 'Partner', 'Boxer'] },
  { nome: 'Porsche', modelos: ['911', 'Cayenne', 'Macan', 'Panamera'] },
  { nome: 'RAM', modelos: ['Rampage', '1500', '2500', '3000'] },
  { nome: 'Subaru', modelos: ['Forester', 'Outback', 'Impreza', 'XV'] },
  { nome: 'Suzuki', modelos: ['Jimny', 'S-Cross', 'Vitara', 'SX4', 'Grand Vitara'] },
  { nome: 'Troller', modelos: ['T4', 'TR4'] },
  { nome: 'Volvo', modelos: ['XC40', 'XC60', 'XC90', 'S60', 'V40', 'V60'] },
];

/** Devolve a lista de modelos da marca (case-insensitive). Vazio se não achar. */
export function modelosDe(marca) {
  if (!marca) return [];
  const alvo = marca.trim().toLowerCase();
  const m = MARCAS.find((x) => x.nome.toLowerCase() === alvo);
  return m ? m.modelos : [];
}
