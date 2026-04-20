import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import RequestsList from "./pages/RequestsList";
import RequestCreate from "./pages/RequestCreate";
import RequestDetail from "./pages/RequestDetail";
import Profile from "./pages/Profile";
import Team from "./pages/Team";
import AdminCompanies from "./pages/admin/Companies";
import AdminEntities from "./pages/admin/Entities";
import AdminHierarchy from "./pages/admin/Hierarchy";
import AdminUsers from "./pages/admin/Users";
import AdminRoles from "./pages/admin/Roles";
import AdminPermissions from "./pages/admin/Permissions";
import AdminDelegation from "./pages/admin/Delegation";
import AdminAudit from "./pages/admin/Audit";
import AdminNotifications from "./pages/admin/Notifications";
import AdminMonitoring from "./pages/admin/Monitoring";
import AdminReports from "./pages/admin/Reports";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Index />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/requests" element={<RequestsList />} />
            <Route path="/requests/new" element={<RequestCreate />} />
            <Route path="/requests/:id" element={<RequestDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/team" element={<Team />} />
            <Route path="/admin/companies" element={<AdminCompanies />} />
            <Route path="/admin/entities" element={<AdminEntities />} />
            <Route path="/admin/hierarchy" element={<AdminHierarchy />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/roles" element={<AdminRoles />} />
            <Route path="/admin/permissions" element={<AdminPermissions />} />
            <Route path="/admin/delegation" element={<AdminDelegation />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="/admin/notifications" element={<AdminNotifications />} />
            <Route path="/admin/monitoring" element={<AdminMonitoring />} />
            <Route path="/admin/reports" element={<AdminReports />} />
          </Route>
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
