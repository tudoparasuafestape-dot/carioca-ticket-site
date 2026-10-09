// Synthetic review data only. No production IDs, attendees or prices.
const events = [
  { id: 'PREVIEW-MUSICA', nome: 'Encontro de música — demonstração', data: '20/12/2030', horario: '18h às 22h',
    local: 'Espaço de demonstração', cidade: 'Recife', uf: 'PE',
    visual: { capaUrl: '/__fixture/music.svg', categoria: 'Música · fixture', descricaoCurta: 'Evento fictício para revisar a apresentação da home.' } },
  { id: 'PREVIEW-CRIATIVO', nome: 'Encontro criativo — demonstração', data: '21/12/2030', horario: '10h às 16h',
    local: 'Auditório de demonstração', cidade: 'Caruaru', uf: 'PE',
    visual: { capaUrl: '/__fixture/creative.svg', categoria: 'Cultura · fixture', descricaoCurta: 'Dados sintéticos, sem venda ou emissão de ingresso.' } }
];
function cover(kind) {
  const music = kind === 'music';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1882" height="836" viewBox="0 0 1882 836"><rect width="1882" height="836" fill="${music ? '#253b30' : '#533e55'}"/><circle cx="1560" cy="400" r="440" fill="${music ? '#8aab74' : '#bb8d81'}"/><circle cx="1560" cy="400" r="300" fill="none" stroke="#efda92" stroke-width="3"/><circle cx="1560" cy="400" r="180" fill="none" stroke="#efda92" stroke-width="3"/><g fill="#fff7df" font-family="Arial, sans-serif"><text x="100" y="150" font-size="26" letter-spacing="8">PREVIEW · DADOS SINTÉTICOS</text><text x="95" y="398" font-size="115">${music ? 'Encontro' : 'Ideias em'}</text><text x="95" y="526" font-size="115">${music ? 'de música' : 'movimento'}</text><text x="100" y="722" font-size="30">EVENTO FICTÍCIO / SEM VENDA</text></g></svg>`;
}
module.exports = { events, cover };
