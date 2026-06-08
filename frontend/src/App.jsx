import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import { safeUser } from './lib/safeUser';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Items from './pages/Items';
import ItemDetail from './pages/ItemDetail';
import Scan from './pages/Scan';
import Vendors from './pages/Vendors';
import Customers from './pages/Customers';
import PurchaseOrders from './pages/PurchaseOrders';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail';
import Inward from './pages/Inward';
import InwardDetail from './pages/InwardDetail';
import Outward from './pages/Outward';
import OutwardDetail from './pages/OutwardDetail';
import Challan from './pages/Challan';
import Reports from './pages/Reports';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import Catalog from './pages/Catalog';
import OpeningStock from './pages/OpeningStock';
import BulkNormalize from './pages/BulkNormalize';
import Profile from './pages/Profile'
import FeaturesShowcase from './pages/FeaturesShowcase';
import MISDashboard from './pages/MISDashboard';
import StockTransfer from './pages/StockTransfer';
import ExpiryAlerts from './pages/ExpiryAlerts';
import BatchViewer from './pages/BatchViewer';
import MarginReport from './pages/MarginReport';
import SystemHealth from './pages/SystemHealth';
import Locations from './pages/Locations';
import CustomFields from './pages/CustomFields';
import EPRDashboard from './pages/EPRDashboard';

function ProtectedRoute({ children, roles }) {
  const token = localStorage.getItem('fg_token');
  if (!token) return <Navigate to="/login" replace />;
  if (roles && roles.length > 0) {
    const user = safeUser();
    if (!roles.includes(user.role)) {
      return <Navigate to="/items" replace />;
    }
  }
  return children;
}

function P({ children, roles }) {
  return <ProtectedRoute roles={roles}>{children}</ProtectedRoute>;
}

export default function App() {
  const location = useLocation();
  const isLogin = location.pathname === '/login';

  return (
    <>
      {!isLogin && <Sidebar />}
      <div style={isLogin ? {} : { marginLeft: 'var(--sidebar-w)', minHeight: '100vh', background: 'var(--bg)' }}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/items" element={<P><Items /></P>} />
          <Route path="/items/scan" element={<P><Scan /></P>} />
          <Route path="/items/:id" element={<P><ItemDetail /></P>} />
          <Route path="/vendors" element={<P><Vendors /></P>} />
          <Route path="/customers" element={<P><Customers /></P>} />
          <Route path="/purchase-orders" element={<P><PurchaseOrders /></P>} />
          <Route path="/purchase-orders/:id" element={<P><PurchaseOrderDetail /></P>} />
          <Route path="/inward" element={<P><Inward /></P>} />
          <Route path="/inward/:id" element={<P><InwardDetail /></P>} />
          <Route path="/outward" element={<P><Outward /></P>} />
          <Route path="/outward/:id" element={<P><OutwardDetail /></P>} />
          <Route path="/stock-transfers" element={<P><StockTransfer /></P>} />
          <Route path="/challan/:id" element={<P><Challan /></P>} />
          <Route path="/reports" element={<P><Reports /></P>} />
          <Route path="/mis-dashboard" element={<P><MISDashboard /></P>} />
          <Route path="/expiry-alerts" element={<P><ExpiryAlerts /></P>} />
          <Route path="/margin-report" element={<P><MarginReport /></P>} />
          <Route path="/system-health" element={<P roles={['admin']}><SystemHealth /></P>} />
          <Route path="/batches" element={<P><BatchViewer /></P>} />
          <Route path="/users" element={<P roles={['admin']}><Users /></P>} />
          <Route path="/audit-log" element={<P roles={['admin']}><AuditLog /></P>} />
          <Route path="/catalog" element={<P><Catalog /></P>} />
          <Route path="/opening-stock" element={<P roles={['admin']}><OpeningStock /></P>} />
          <Route path="/locations" element={<P><Locations /></P>} />
          <Route path="/custom-fields" element={<P roles={['admin']}><CustomFields /></P>} />
          <Route path="/normalize" element={<P><BulkNormalize /></P>} />
          <Route path="/profile" element={<P><Profile /></P>} />
          <Route path="/epr" element={<P><EPRDashboard /></P>} />
          <Route path="/features" element={<FeaturesShowcase />} />
          <Route path="/" element={<P><Dashboard /></P>} />
          <Route path="*" element={<Navigate to="/items" replace />} />
        </Routes>
      </div>
    </>
  );
}
