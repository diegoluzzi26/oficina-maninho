import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getToken } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Ordens from './pages/Ordens';
import Servicos from './pages/Servicos';
import Despesas from './pages/Despesas';
import Fornecedores from './pages/Fornecedores';
import Financeiro from './pages/Financeiro';
import Retornos from './pages/Retornos';
import Agenda from './pages/Agenda';
import Configuracoes from './pages/Configuracoes';
import Pessoal from './pages/Pessoal';
import Funcionarios from './pages/Funcionarios';
import ImprimirOS from './pages/ImprimirOS';

function Protegida({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Views "papel" — sem Layout, pra não vir cabeçalho colorido na impressão */}
        <Route path="/os/:id/imprimir"
          element={<Protegida><ImprimirOS /></Protegida>} />
        <Route path="/" element={<Protegida><Layout /></Protegida>}>
          <Route index element={<Dashboard />} />
          <Route path="ordens" element={<Ordens />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="despesas" element={<Despesas />} />
          <Route path="pessoal" element={<Pessoal />} />
          <Route path="funcionarios" element={<Funcionarios />} />
          <Route path="fornecedores" element={<Fornecedores />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="retornos" element={<Retornos />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="servicos" element={<Servicos />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
