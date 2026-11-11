import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './lib/api';
import { temPermissao, telaInicial } from './lib/permissoes';
import Layout, { SemAcesso } from './components/Layout';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import AgendarOnline from './pages/AgendarOnline';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Ordens from './pages/Ordens';
import Servicos from './pages/Servicos';
import Assistente from './pages/Assistente';
import Despesas from './pages/Despesas';
import Fornecedores from './pages/Fornecedores';
import Financeiro from './pages/Financeiro';
import DRE from './pages/DRE';
import Agenda from './pages/Agenda';
import Configuracoes from './pages/Configuracoes';
import Pessoal from './pages/Pessoal';
import Funcionarios from './pages/Funcionarios';
import Recorrentes from './pages/Recorrentes';
import ImprimirOS from './pages/ImprimirOS';
import ImprimirChecklist from './pages/ImprimirChecklist';
import Followup from './pages/Followup';
import PlataformaOficinas from './pages/PlataformaOficinas';
import Usuarios from './pages/Usuarios';
import Plano from './pages/Plano';
import NotasFiscais from './pages/NotasFiscais';

function Protegida({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

/** Quem não tem o Painel liberado vai direto pra primeira tela permitida. */
function PainelOuOrdens() {
  return temPermissao('painel') ? <Dashboard /> : <Navigate to={telaInicial()} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/agendar/:slug" element={<AgendarOnline />} />
        {/* Views "papel" — sem Layout, pra não vir cabeçalho colorido na impressão */}
        <Route path="/os/:id/imprimir"
          element={<Protegida><ImprimirOS /></Protegida>} />
        <Route path="/os/:id/checklist/imprimir"
          element={<Protegida><ImprimirChecklist /></Protegida>} />
        <Route path="/" element={<Protegida><Layout /></Protegida>}>
          <Route index element={<PainelOuOrdens />} />
          <Route path="ordens" element={<Ordens />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="despesas" element={<Despesas />} />
          <Route path="pessoal" element={<Pessoal />} />
          <Route path="funcionarios" element={<Funcionarios />} />
          <Route path="recorrentes" element={<Recorrentes />} />
          <Route path="fornecedores" element={<Fornecedores />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="dre" element={<DRE />} />
          <Route path="retornos" element={<Navigate to="/followup?aba=revisoes" replace />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="servicos" element={<Servicos />} />
          <Route path="assistente" element={<Assistente />} />
          <Route path="followup" element={<Followup />} />
          <Route path="followup/regras" element={<Navigate to="/followup?aba=automacoes" replace />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="equipe" element={<Usuarios />} />
          <Route path="plano" element={<Plano />} />
          <Route path="notas-fiscais" element={<NotasFiscais />} />
          <Route path="plataforma" element={<PlataformaOficinas />} />
          <Route path="sem-acesso" element={<SemAcesso />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
