import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import AuthPage from './AuthPage';

const Index = () => {
  const { isAuthenticated, initialized } = useAuthStore();

  if (!initialized) return null;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <AuthPage />;
};

export default Index;
